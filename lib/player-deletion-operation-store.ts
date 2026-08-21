import { randomUUID } from "node:crypto";
import { getPostgresClient } from "./postgres-store.ts";
import { ensurePostgresSchema } from "./postgres-schema.ts";
import {
  playerDeletionSteps,
  type PlayerDeletionOperation,
  type PlayerDeletionStep,
  type PlayerDeletionTrigger,
} from "./player-deletion-operation.ts";

type OperationRow = {
  operation_id: string;
  player_id: string;
  trigger_kind: PlayerDeletionTrigger;
  state: "active" | "deleted";
  completed_steps: unknown;
};

async function ensureDeletionSchema() {
  await ensurePostgresSchema();
  await getPostgresClient()`
    CREATE TABLE IF NOT EXISTS player_deletion_operations (
      operation_id uuid PRIMARY KEY,
      player_id text NOT NULL UNIQUE,
      trigger_kind text NOT NULL CHECK (trigger_kind IN ('explicit', 'retention')),
      state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'deleted')),
      completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      completed_at timestamptz
    )
  `;
}

function normalize(row: OperationRow): PlayerDeletionOperation {
  const listed = Array.isArray(row.completed_steps) ? row.completed_steps : [];
  return {
    operationId: row.operation_id,
    playerId: row.player_id,
    trigger: row.trigger_kind,
    state: row.state,
    completedSteps: playerDeletionSteps.filter((step) => listed.includes(step)),
  };
}

export async function beginPlayerDeletion(playerId: string, trigger: PlayerDeletionTrigger) {
  await ensureDeletionSchema();
  const rows = await getPostgresClient()`
    INSERT INTO player_deletion_operations (operation_id, player_id, trigger_kind)
    VALUES (${randomUUID()}, ${playerId}, ${trigger})
    ON CONFLICT (player_id) DO UPDATE SET updated_at = player_deletion_operations.updated_at
    RETURNING operation_id, player_id, trigger_kind, state, completed_steps
  ` as OperationRow[];
  return normalize(rows[0]);
}

export async function loadActivePlayerDeletion(playerId: string) {
  await ensureDeletionSchema();
  const rows = await getPostgresClient()`
    SELECT operation_id, player_id, trigger_kind, state, completed_steps
    FROM player_deletion_operations WHERE player_id = ${playerId} AND state = 'active' LIMIT 1
  ` as OperationRow[];
  return rows[0] ? normalize(rows[0]) : null;
}

export async function playerDeletionBlocksAccess(playerId: string) {
  return Boolean(await loadActivePlayerDeletion(playerId));
}

export async function completePlayerDeletionStep(operationId: string, step: PlayerDeletionStep) {
  await ensureDeletionSchema();
  await getPostgresClient()`
    UPDATE player_deletion_operations
    SET completed_steps = CASE
      WHEN completed_steps ? ${step} THEN completed_steps
      ELSE completed_steps || to_jsonb(${step}::text)
    END, updated_at = NOW()
    WHERE operation_id = ${operationId} AND state = 'active'
  `;
}

export async function completePlayerDeletionOperation(operationId: string) {
  await ensureDeletionSchema();
  await getPostgresClient()`
    UPDATE player_deletion_operations
    SET state = 'deleted', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
    WHERE operation_id = ${operationId}
      AND state = 'active'
      AND completed_steps @> ${JSON.stringify(playerDeletionSteps)}::jsonb
  `;
}

export async function listActivePlayerDeletions(limit = 100) {
  await ensureDeletionSchema();
  const rows = await getPostgresClient()`
    SELECT operation_id, player_id, trigger_kind, state, completed_steps
    FROM player_deletion_operations WHERE state = 'active'
    ORDER BY created_at ASC LIMIT ${Math.max(1, Math.min(limit, 100))}
  ` as OperationRow[];
  return rows.map(normalize);
}
