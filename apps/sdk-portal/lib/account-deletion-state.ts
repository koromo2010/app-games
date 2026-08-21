import { ensureSdkSchema, sdkSql } from "./sdk-postgres.ts";

export async function ensureSdkAccountDeletionStateSchema() {
  await ensureSdkSchema();
  await sdkSql()`
    CREATE TABLE IF NOT EXISTS sdk_account_deletion_states (
      operation_id uuid PRIMARY KEY,
      player_id text NOT NULL UNIQUE,
      state text NOT NULL DEFAULT 'blocked' CHECK (state IN ('blocked', 'deleted')),
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `;
}

export async function sdkAccountDeletionBlocksAccess(playerId: string) {
  await ensureSdkAccountDeletionStateSchema();
  const rows = await sdkSql()`
    SELECT 1 FROM sdk_account_deletion_states WHERE player_id = ${playerId} LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0;
}

export async function blockSdkAccountForDeletion(operationId: string, playerId: string) {
  await ensureSdkAccountDeletionStateSchema();
  await sdkSql()`
    INSERT INTO sdk_account_deletion_states (operation_id, player_id)
    VALUES (${operationId}::uuid, ${playerId})
    ON CONFLICT (player_id) DO UPDATE
    SET updated_at = sdk_account_deletion_states.updated_at
  `;
}

export async function completeSdkAccountDeletion(operationId: string, playerId: string) {
  await sdkSql()`
    UPDATE sdk_account_deletion_states
    SET state = 'deleted', updated_at = NOW()
    WHERE operation_id = ${operationId}::uuid AND player_id = ${playerId}
  `;
}
