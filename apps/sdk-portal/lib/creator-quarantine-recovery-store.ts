import type { RuntimeArtifactReader } from "@game-fields/sdk-runtime-artifact";
import {
  createCreatorRecoveryPlan,
  createCreatorRecoveryTerminalReceipt,
  CreatorRecoveryError,
  creatorQuarantineRecoveryIntent,
  creatorQuarantineRecoveryTarget,
  type CreatorRecoveryEnvironment,
  type CreatorRecoveryFaultPoint,
  type CreatorRecoverySnapshot,
  type PreparedCreatorRecoveryPlan,
} from "@/lib/creator-quarantine-recovery";
import {
  inspectCreatorArtifacts,
  type ForensicArtifactTarget,
} from "@/lib/creator-deletion-forensics";
import { sdkSql } from "@/lib/sdk-postgres";

type PlanRow = {
  creatorRows: unknown;
  deletedCreatorRows: unknown;
  ownerBoundRows: unknown;
  tombstonedGameRows: unknown;
  activeGameRows: unknown;
  packageRevisionRows: unknown;
  releaseRows: unknown;
  currentReleaseRows: unknown;
  activeCreatorCollisions: unknown;
  dbVersionToken: unknown;
};

type ArtifactRow = {
  gameId: unknown;
  mockRevision: unknown;
  packageRevision: unknown;
  savedPackageRevision: unknown;
};

function count(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function revisionTargets(rows: readonly ArtifactRow[]) {
  const targets: ForensicArtifactTarget[] = [];
  for (const row of rows) {
    const gameId = typeof row.gameId === "string" ? row.gameId : "";
    for (const [kind, field] of [
      ["mock", "mockRevision"],
      ["package", "packageRevision"],
      ["package", "savedPackageRevision"],
    ] as const) {
      const revision = row[field];
      if (gameId && typeof revision === "string") {
        targets.push({ kind, gameId, revision });
      }
    }
  }
  return targets;
}

export async function readCreatorRecoveryPlan(
  environment: CreatorRecoveryEnvironment,
  reader: Pick<RuntimeArtifactReader, "readCommit" | "readTree">,
): Promise<PreparedCreatorRecoveryPlan> {
  const sql = sdkSql();
  const [planResults, artifactResults] = await sql.transaction((tx) => [
    tx`
      WITH target_creator AS MATERIALIZED (
        SELECT id, owner_player_id, deleted_at, updated_at
        FROM sdk_creators
        WHERE slug = ${creatorQuarantineRecoveryTarget}
      ), target_games AS MATERIALIZED (
        SELECT id, creator_id, game_id, status, mock_revision, package_revision,
               deleted_at, updated_at
        FROM sdk_games
        WHERE creator_id IN (SELECT id FROM target_creator)
      ), target_packages AS MATERIALIZED (
        SELECT game_id, revision, created_at
        FROM sdk_game_package_revisions
        WHERE game_id IN (SELECT id FROM target_games)
      ), target_releases AS MATERIALIZED (
        SELECT id, revision, is_current, released_at
        FROM sdk_app_releases
        WHERE source_creator_slug = ${creatorQuarantineRecoveryTarget}
      ), version_source AS (
        SELECT concat_ws('||',
          COALESCE((
            SELECT string_agg(concat_ws('|', id::TEXT, owner_player_id,
              deleted_at::TEXT, updated_at::TEXT), ',' ORDER BY id)
            FROM target_creator
          ), ''),
          COALESCE((
            SELECT string_agg(concat_ws('|', id::TEXT, creator_id::TEXT, game_id,
              status, mock_revision, package_revision, deleted_at::TEXT,
              updated_at::TEXT), ',' ORDER BY id)
            FROM target_games
          ), ''),
          COALESCE((
            SELECT string_agg(concat_ws('|', game_id::TEXT, revision,
              created_at::TEXT), ',' ORDER BY game_id, revision)
            FROM target_packages
          ), ''),
          COALESCE((
            SELECT string_agg(concat_ws('|', id::TEXT, revision, is_current::TEXT,
              released_at::TEXT), ',' ORDER BY id)
            FROM target_releases
          ), '')
        ) AS source
      )
      SELECT
        (SELECT COUNT(*) FROM target_creator)::INTEGER AS "creatorRows",
        (SELECT COUNT(*) FROM target_creator WHERE deleted_at IS NOT NULL)::INTEGER AS "deletedCreatorRows",
        (SELECT COUNT(*) FROM target_creator WHERE owner_player_id IS NOT NULL)::INTEGER AS "ownerBoundRows",
        (SELECT COUNT(*) FROM target_games WHERE deleted_at IS NOT NULL)::INTEGER AS "tombstonedGameRows",
        (SELECT COUNT(*) FROM target_games WHERE deleted_at IS NULL)::INTEGER AS "activeGameRows",
        (SELECT COUNT(*) FROM target_packages)::INTEGER AS "packageRevisionRows",
        (SELECT COUNT(*) FROM target_releases)::INTEGER AS "releaseRows",
        (SELECT COUNT(*) FROM target_releases WHERE is_current)::INTEGER AS "currentReleaseRows",
        (SELECT COUNT(*) FROM target_creator WHERE deleted_at IS NULL)::INTEGER AS "activeCreatorCollisions",
        (SELECT md5(source) || md5('v2|' || source) FROM version_source) AS "dbVersionToken"
    `,
    tx`
      SELECT g.game_id AS "gameId", g.mock_revision AS "mockRevision",
             g.package_revision AS "packageRevision", r.revision AS "savedPackageRevision"
      FROM sdk_creators c
      JOIN sdk_games g ON g.creator_id = c.id
      LEFT JOIN sdk_game_package_revisions r ON r.game_id = g.id
      WHERE c.slug = ${creatorQuarantineRecoveryTarget}
    `,
  ], { isolationLevel: "RepeatableRead", readOnly: true });
  const row = ((planResults as PlanRow[])[0] ?? {}) as PlanRow;
  const artifacts = await inspectCreatorArtifacts(
    revisionTargets(artifactResults as ArtifactRow[]),
    reader,
  );
  const creatorRows = count(row.creatorRows);
  const deletedCreatorRows = count(row.deletedCreatorRows);
  const ownerBoundRows = count(row.ownerBoundRows);
  const snapshot: CreatorRecoverySnapshot = {
    creatorLifecycle: creatorRows === 0
      ? "missing"
      : deletedCreatorRows === 1
        ? "deleted"
        : "active",
    ownerAuthority: ownerBoundRows === 0 ? "none" : "bound",
    counts: {
      creatorRows,
      tombstonedGameRows: count(row.tombstonedGameRows),
      activeGameRows: count(row.activeGameRows),
      packageRevisionRows: count(row.packageRevisionRows),
      artifactLocators: artifacts.locators,
      artifactsPresent: artifacts.present,
      releaseRows: count(row.releaseRows),
      currentReleaseRows: count(row.currentReleaseRows),
      activeCreatorCollisions: count(row.activeCreatorCollisions),
    },
    artifactStatus: artifacts.status,
    dbVersionToken: typeof row.dbVersionToken === "string" ? row.dbVersionToken : "",
  };
  return createCreatorRecoveryPlan(environment, snapshot);
}

type ExecutionRow = {
  result: "COMPLETED" | "PRECONDITION_FAILED" | "CONCURRENT_CHANGE" | "OPERATION_CONFLICT" | "UNAVAILABLE";
  terminalReceipt: string | null;
  replayed: boolean;
};

export async function quarantineCreatorRecovery(input: {
  environment: CreatorRecoveryEnvironment;
  operationId: string;
  planReceipt: string;
  terminalReceipt: string;
  concurrencyToken: string;
  faultAt?: CreatorRecoveryFaultPoint;
}) {
  if (input.faultAt === "before-ledger") {
    throw new CreatorRecoveryError(
      "CREATOR_RECOVERY_UNAVAILABLE",
      { phase: "quarantine-ledger", store: "recovery-ledger" },
      "INJECTED_BEFORE_LEDGER",
    );
  }
  const sql = sdkSql();
  const [rows] = await sql.transaction((tx) => [tx`
    WITH locked_creator AS MATERIALIZED (
      SELECT id, owner_player_id, deleted_at, updated_at
      FROM sdk_creators
      WHERE slug = ${creatorQuarantineRecoveryTarget}
      FOR UPDATE
    ), locked_games AS MATERIALIZED (
      SELECT id, creator_id, game_id, status, mock_revision, package_revision,
             deleted_at, updated_at
      FROM sdk_games
      WHERE creator_id IN (SELECT id FROM locked_creator)
      ORDER BY id
      FOR UPDATE
    ), locked_packages AS MATERIALIZED (
      SELECT game_id, revision, created_at
      FROM sdk_game_package_revisions
      WHERE game_id IN (SELECT id FROM locked_games)
      ORDER BY game_id, revision
      FOR UPDATE
    ), locked_releases AS MATERIALIZED (
      SELECT id, revision, is_current, released_at
      FROM sdk_app_releases
      WHERE source_creator_slug = ${creatorQuarantineRecoveryTarget}
      ORDER BY id
      FOR UPDATE
    ), version_source AS (
      SELECT concat_ws('||',
        COALESCE((
          SELECT string_agg(concat_ws('|', id::TEXT, owner_player_id,
            deleted_at::TEXT, updated_at::TEXT), ',' ORDER BY id)
          FROM locked_creator
        ), ''),
        COALESCE((
          SELECT string_agg(concat_ws('|', id::TEXT, creator_id::TEXT, game_id,
            status, mock_revision, package_revision, deleted_at::TEXT,
            updated_at::TEXT), ',' ORDER BY id)
          FROM locked_games
        ), ''),
        COALESCE((
          SELECT string_agg(concat_ws('|', game_id::TEXT, revision,
            created_at::TEXT), ',' ORDER BY game_id, revision)
          FROM locked_packages
        ), ''),
        COALESCE((
          SELECT string_agg(concat_ws('|', id::TEXT, revision, is_current::TEXT,
            released_at::TEXT), ',' ORDER BY id)
          FROM locked_releases
        ), '')
      ) AS source
    ), shape AS (
      SELECT
        (SELECT COUNT(*) FROM locked_creator)::INTEGER AS creator_rows,
        (SELECT COUNT(*) FROM locked_creator WHERE deleted_at IS NOT NULL)::INTEGER AS deleted_creator_rows,
        (SELECT COUNT(*) FROM locked_creator WHERE owner_player_id IS NOT NULL)::INTEGER AS owner_bound_rows,
        (SELECT COUNT(*) FROM locked_games WHERE deleted_at IS NOT NULL)::INTEGER AS tombstoned_game_rows,
        (SELECT COUNT(*) FROM locked_games WHERE deleted_at IS NULL)::INTEGER AS active_game_rows,
        (SELECT COUNT(*) FROM locked_packages)::INTEGER AS package_revision_rows,
        (SELECT COUNT(*) FROM locked_releases)::INTEGER AS release_rows,
        (SELECT COUNT(*) FROM locked_releases WHERE is_current)::INTEGER AS current_release_rows,
        (SELECT md5(source) || md5('v2|' || source) FROM version_source) AS db_version_token
    ), existing AS MATERIALIZED (
      SELECT operation_id, plan_receipt, terminal_receipt, state
      FROM sdk_creator_recovery_operations
      WHERE target_slug = ${creatorQuarantineRecoveryTarget}
      FOR UPDATE
    ), eligible AS (
      SELECT s.*, c.id AS creator_id
      FROM shape s
      CROSS JOIN locked_creator c
      WHERE s.creator_rows = 1
        AND s.deleted_creator_rows = 1
        AND s.owner_bound_rows = 0
        AND s.tombstoned_game_rows = 2
        AND s.active_game_rows = 0
        AND s.package_revision_rows = 1
        AND s.release_rows = 0
        AND s.current_release_rows = 0
        AND s.db_version_token = ${input.concurrencyToken}
        AND NOT EXISTS (
          SELECT 1 FROM existing
          WHERE operation_id <> ${input.operationId}::UUID
             OR plan_receipt <> ${input.planReceipt}
        )
    ), created_operation AS (
      INSERT INTO sdk_creator_recovery_operations (
        operation_id, creator_id, target_slug, intent, plan_receipt,
        terminal_receipt, state, phase, game_count,
        package_revision_count, artifact_locator_count, release_count
      )
      SELECT ${input.operationId}::UUID, creator_id,
             ${creatorQuarantineRecoveryTarget}, ${creatorQuarantineRecoveryIntent},
             ${input.planReceipt}, ${input.terminalReceipt},
             'pending', 'ledger-recorded', 2, 1, 2, 0
      FROM eligible
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      ON CONFLICT DO NOTHING
      RETURNING operation_id, plan_receipt, terminal_receipt, state
    ), operation_row AS MATERIALIZED (
      SELECT * FROM existing
      UNION ALL
      SELECT * FROM created_operation
    ), ledger_gate AS MATERIALIZED (
      SELECT 1 / CASE
        WHEN ${input.faultAt === "after-ledger"}
          AND EXISTS (SELECT 1 FROM created_operation) THEN 0
        ELSE 1
      END AS ok
    ), inserted_items AS (
      INSERT INTO sdk_creator_recovery_quarantine_games (
        operation_id, game_id, recovery_state, visibility,
        owner_binding_state, publication_state
      )
      SELECT o.operation_id, g.id, 'quarantined', 'non-public', 'unbound', 'blocked'
      FROM operation_row o
      CROSS JOIN locked_games g
      CROSS JOIN ledger_gate
      WHERE o.operation_id = ${input.operationId}::UUID
        AND o.state = 'pending'
      ON CONFLICT (operation_id, game_id) DO NOTHING
      RETURNING game_id
    ), item_gate AS MATERIALIZED (
      SELECT 1 / CASE
        WHEN ${input.faultAt === "after-quarantine-items"}
          AND EXISTS (SELECT 1 FROM inserted_items) THEN 0
        ELSE 1
      END AS ok
    ), terminal_gate AS MATERIALIZED (
      SELECT 1 / CASE
        WHEN ${input.faultAt === "before-terminal"}
          AND EXISTS (SELECT 1 FROM operation_row WHERE state = 'pending') THEN 0
        ELSE 1
      END AS ok
    ), completed AS (
      UPDATE sdk_creator_recovery_operations o
      SET state = 'completed', phase = 'quarantined',
          completed_at = NOW(), updated_at = NOW()
      FROM item_gate, terminal_gate
      WHERE o.operation_id = ${input.operationId}::UUID
        AND o.state = 'pending'
        AND (
          SELECT COUNT(*) FROM sdk_creator_recovery_quarantine_games q
          WHERE q.operation_id = o.operation_id
        ) = 2
      RETURNING o.operation_id, o.terminal_receipt
    ), terminal AS (
      SELECT operation_id, terminal_receipt, FALSE AS replayed
      FROM completed
      UNION ALL
      SELECT operation_id, terminal_receipt, TRUE AS replayed
      FROM existing
      WHERE operation_id = ${input.operationId}::UUID AND state = 'completed'
    )
    SELECT
      CASE
        WHEN EXISTS (
          SELECT 1 FROM existing
          WHERE operation_id <> ${input.operationId}::UUID
             OR plan_receipt <> ${input.planReceipt}
        ) THEN 'OPERATION_CONFLICT'
        WHEN (SELECT db_version_token FROM shape) <> ${input.concurrencyToken}
          THEN 'CONCURRENT_CHANGE'
        WHEN NOT EXISTS (SELECT 1 FROM eligible)
          THEN 'PRECONDITION_FAILED'
        WHEN EXISTS (SELECT 1 FROM terminal)
          THEN 'COMPLETED'
        ELSE 'UNAVAILABLE'
      END AS result,
      (SELECT terminal_receipt FROM terminal LIMIT 1) AS "terminalReceipt",
      COALESCE((SELECT replayed FROM terminal LIMIT 1), FALSE) AS replayed
  `], { isolationLevel: "Serializable" });
  const result = ((rows as ExecutionRow[])[0] ?? { result: "UNAVAILABLE" }) as ExecutionRow;
  if (result.result === "PRECONDITION_FAILED") {
    throw new CreatorRecoveryError(
      "CREATOR_RECOVERY_PRECONDITION_FAILED",
      { phase: "quarantine-transaction", store: "sdk-postgres" },
    );
  }
  if (result.result === "CONCURRENT_CHANGE") {
    throw new CreatorRecoveryError(
      "CREATOR_RECOVERY_CONCURRENT_CHANGE",
      { phase: "quarantine-transaction", store: "sdk-postgres" },
    );
  }
  if (result.result === "OPERATION_CONFLICT") {
    throw new CreatorRecoveryError(
      "CREATOR_RECOVERY_OPERATION_CONFLICT",
      { phase: "quarantine-ledger", store: "recovery-ledger" },
    );
  }
  if (result.result !== "COMPLETED" || result.terminalReceipt !== input.terminalReceipt) {
    throw new CreatorRecoveryError(
      "CREATOR_RECOVERY_UNAVAILABLE",
      { phase: "terminal-receipt", store: "recovery-ledger" },
    );
  }
  return createCreatorRecoveryTerminalReceipt({
    environment: input.environment,
    operationId: input.operationId,
    planReceipt: input.planReceipt,
    counts: {
      creatorRows: 1,
      tombstonedGameRows: 2,
      activeGameRows: 0,
      packageRevisionRows: 1,
      artifactLocators: 2,
      artifactsPresent: 2,
      releaseRows: 0,
      currentReleaseRows: 0,
      activeCreatorCollisions: 0,
    },
    replayed: result.replayed,
  });
}
