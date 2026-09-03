import type { ProductionOwnerRestorationWorkspaceSource } from "../../../lib/production-owner-restoration.ts";
import { productionPrivateWorkspaceImportRecoveryIdentity } from "./production-private-workspace-import-public-contract.ts";
import { sdkSql } from "./sdk-postgres.ts";

export async function readProductionOwnerRestorationWorkspace(): Promise<ProductionOwnerRestorationWorkspaceSource | null> {
  const sql = sdkSql();
  const rows = await sql`
    SELECT
      w.workspace_id::TEXT AS workspace_identity,
      o.operation_id::TEXT AS operation_id,
      w.bundle_sha256,
      w.workspace_manifest_sha256,
      w.per_game_ledger_sha256,
      1::INTEGER AS workspace_rows,
      (SELECT COUNT(*) FROM sdk_production_private_workspace_games g WHERE g.workspace_id = w.workspace_id)::INTEGER AS game_rows,
      (SELECT COUNT(*) FROM sdk_production_private_workspace_files f WHERE f.workspace_id = w.workspace_id)::INTEGER AS file_rows,
      w.visibility,
      w.owner_binding_state AS owner_binding,
      w.grants_created AS grants,
      w.releases_created AS releases,
      w.publications_created AS publications,
      w.aliases_created AS aliases,
      w.rooms_created AS rooms
    FROM sdk_production_private_workspaces w
    JOIN sdk_production_private_workspace_import_operations o ON o.operation_id = w.operation_id
    WHERE w.target_key = 'moi-lab2'
      AND w.environment = 'production'
      AND o.environment = 'production'
      AND o.operation_id = ${productionPrivateWorkspaceImportRecoveryIdentity.operationId}::UUID
      AND o.state = 'completed' AND o.phase = 'imported-private'
    LIMIT 2
  ` as Array<Record<string, unknown>>;
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  const text = (value: unknown) => typeof value === "string" ? value : "";
  const count = (value: unknown) => Number.isSafeInteger(Number(value)) ? Number(value) : -1;
  return {
    workspaceIdentity: text(row.workspace_identity),
    operationId: text(row.operation_id),
    bundleSha256: text(row.bundle_sha256),
    workspaceManifestSha256: text(row.workspace_manifest_sha256),
    perGameLedgerSha256: text(row.per_game_ledger_sha256),
    workspaceRows: count(row.workspace_rows),
    gameRows: count(row.game_rows),
    fileRows: count(row.file_rows),
    visibility: text(row.visibility),
    ownerBinding: text(row.owner_binding),
    grants: count(row.grants),
    releases: count(row.releases),
    publications: count(row.publications),
    aliases: count(row.aliases),
    rooms: count(row.rooms),
  };
}
