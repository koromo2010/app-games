import {
  ProductionPrivateWorkspaceImportError,
  productionPrivateWorkspaceImportIntent,
  productionPrivateWorkspaceImportRecoveryIdentity,
  type CompletedProductionPrivateWorkspaceImport,
  type ProductionPrivateWorkspaceImportAdapter,
  type ProductionPrivateWorkspaceImportBeforeState,
  type ProductionPrivateWorkspaceImportReadBack,
  type ProductionPrivateWorkspaceImportTarget,
} from "./production-private-workspace-import.ts";
import {
  productionPrivateWorkspaceImportObjectNames,
  productionPrivateWorkspaceImportSchemaStatements,
} from "./production-private-workspace-import-schema.ts";
import { createHash } from "node:crypto";
import {
  ProductionOwnerRestorationDiagnosticError,
  diagnosticQueryFailureCode,
} from "../../../lib/production-owner-restoration-diagnostic.ts";
import {
  createSdkDatabaseBindingDiagnostic,
  resolveSdkDatabaseBinding,
} from "./sdk-database-binding-diagnostic.ts";
import { sdkRuntimeSqlContext } from "./sdk-postgres.ts";

type SnapshotRow = Record<string, unknown>;

export const productionPrivateWorkspaceImportEmptyUnrelatedPrivateStateText = ["", "", "", ""].join("||");

const unrelatedPrivateStateTextSql = `concat_ws('||',
  COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY operation_id)
    FROM sdk_production_private_workspace_import_operations r WHERE target_key <> $1), ''),
  COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY workspace_id)
    FROM sdk_production_private_workspaces r WHERE target_key <> $1), ''),
  COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY workspace_id, game_id)
    FROM sdk_production_private_workspace_games r
    WHERE workspace_id IN (SELECT workspace_id FROM sdk_production_private_workspaces WHERE target_key <> $1)), ''),
  COALESCE((SELECT string_agg(concat_ws('|', workspace_id::TEXT, game_id, path, byte_length::TEXT, content_sha256), ','
    ORDER BY workspace_id, game_id, path) FROM sdk_production_private_workspace_files
    WHERE workspace_id IN (SELECT workspace_id FROM sdk_production_private_workspaces WHERE target_key <> $1)), '')
)`;

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : -1;
}

function token(value: unknown) {
  return typeof value === "string" ? value : "";
}

function snapshotFrom(row: SnapshotRow): ProductionPrivateWorkspaceImportBeforeState {
  return {
    targetCreatorRowId: token(row.targetCreatorRowId),
    targetCreatorRows: count(row.targetCreatorRows),
    targetDeletedCreatorRows: count(row.targetDeletedCreatorRows),
    targetCreatorOwnerRows: count(row.targetCreatorOwnerRows),
    targetGameRows: count(row.targetGameRows),
    targetDeletedGameRows: count(row.targetDeletedGameRows),
    targetActiveGameRows: count(row.targetActiveGameRows),
    targetReleaseRows: count(row.targetReleaseRows),
    targetCurrentReleaseRows: count(row.targetCurrentReleaseRows),
    recoveryOperationRows: count(row.recoveryOperationRows),
    recoveryQuarantineGameRows: count(row.recoveryQuarantineGameRows),
    recoveryIdentityExact: row.recoveryIdentityExact === true,
    targetWorkspaceRows: count(row.targetWorkspaceRows),
    targetWorkspaceGameRows: count(row.targetWorkspaceGameRows),
    targetWorkspaceFileRows: count(row.targetWorkspaceFileRows),
    sourceStateToken: token(row.sourceStateToken),
    publicStateToken: token(row.publicStateToken),
    unrelatedPrivateStateToken: token(row.unrelatedPrivateStateToken),
  };
}

export type ProductionPrivateWorkspaceImportTablePresence = {
  operations: boolean;
  workspaces: boolean;
  games: boolean;
  files: boolean;
};

function tablePresenceFrom(values: Array<string | null | undefined>): ProductionPrivateWorkspaceImportTablePresence {
  return {
    operations: Boolean(values[0]),
    workspaces: Boolean(values[1]),
    games: Boolean(values[2]),
    files: Boolean(values[3]),
  };
}

function allProductionTablesPresent(presence: ProductionPrivateWorkspaceImportTablePresence) {
  return Object.values(presence).every(Boolean);
}

async function productionTablePresence(sql: ReturnType<typeof sdkRuntimeSqlContext>["sql"]) {
  const rows = await sql`
    SELECT ARRAY[
      to_regclass('public.sdk_production_private_workspace_import_operations')::TEXT,
      to_regclass('public.sdk_production_private_workspaces')::TEXT,
      to_regclass('public.sdk_production_private_workspace_games')::TEXT,
      to_regclass('public.sdk_production_private_workspace_files')::TEXT
    ] AS objects
  ` as Array<{ objects?: Array<string | null> }>;
  const presence = tablePresenceFrom(rows[0]?.objects ?? []);
  const present = Object.values(presence).filter(Boolean).length;
  if (present !== 0 && present !== productionPrivateWorkspaceImportObjectNames.length) {
    throw new ProductionPrivateWorkspaceImportError("PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE");
  }
  return presence;
}

const baseSnapshot = `
  WITH target_creators AS MATERIALIZED (
    SELECT * FROM sdk_creators WHERE slug = $1
  ), target_games AS MATERIALIZED (
    SELECT * FROM sdk_games WHERE creator_id IN (SELECT id FROM target_creators)
  ), target_packages AS MATERIALIZED (
    SELECT * FROM sdk_game_package_revisions WHERE game_id IN (SELECT id FROM target_games)
  ), target_releases AS MATERIALIZED (
    SELECT * FROM sdk_app_releases WHERE source_creator_slug = $1
  ), recovery_operations AS MATERIALIZED (
    SELECT * FROM sdk_creator_recovery_operations WHERE target_key = $1
  ), recovery_games AS MATERIALIZED (
    SELECT q.* FROM sdk_creator_recovery_quarantine_games q
    WHERE q.game_id IN (SELECT id FROM target_games)
  ), source_text AS (
    SELECT concat_ws('||',
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM target_creators r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM target_games r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY game_id, revision) FROM target_packages r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM target_releases r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY operation_id) FROM recovery_operations r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY operation_id, game_id) FROM recovery_games r), '')
    ) AS value
  ), public_text AS (
    SELECT concat_ws('||',
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM sdk_app_releases r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM sdk_release_decisions r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM sdk_oauth_grants r), '')
    ) AS value
  )
`;

function selectSnapshot(privateCtes: string, privateColumns: string) {
  return `${baseSnapshot}, ${privateCtes}
    SELECT
      (SELECT id::TEXT FROM target_creators ORDER BY id LIMIT 1) AS "targetCreatorRowId",
      (SELECT COUNT(*) FROM target_creators)::INTEGER AS "targetCreatorRows",
      (SELECT COUNT(*) FROM target_creators WHERE deleted_at IS NOT NULL)::INTEGER AS "targetDeletedCreatorRows",
      (SELECT COUNT(*) FROM target_creators WHERE owner_player_id IS NOT NULL)::INTEGER AS "targetCreatorOwnerRows",
      (SELECT COUNT(*) FROM target_games)::INTEGER AS "targetGameRows",
      (SELECT COUNT(*) FROM target_games WHERE deleted_at IS NOT NULL)::INTEGER AS "targetDeletedGameRows",
      (SELECT COUNT(*) FROM target_games WHERE deleted_at IS NULL)::INTEGER AS "targetActiveGameRows",
      (SELECT COUNT(*) FROM target_releases)::INTEGER AS "targetReleaseRows",
      (SELECT COUNT(*) FROM target_releases WHERE is_current)::INTEGER AS "targetCurrentReleaseRows",
      (SELECT COUNT(*) FROM recovery_operations)::INTEGER AS "recoveryOperationRows",
      (SELECT COUNT(*) FROM recovery_games)::INTEGER AS "recoveryQuarantineGameRows",
      COALESCE((SELECT bool_and(
        o.operation_id = '${productionPrivateWorkspaceImportRecoveryIdentity.operationId}'::UUID
        AND o.terminal_receipt = '${productionPrivateWorkspaceImportRecoveryIdentity.terminalReceipt}'
        AND o.state = 'completed' AND o.phase = 'quarantined'
        AND q.recovery_state = 'quarantined' AND q.visibility = 'non-public'
        AND q.owner_binding_state = 'unbound' AND q.grant_state = 'blocked'
        AND q.release_state = 'blocked' AND q.publication_state = 'blocked'
      ) FROM recovery_operations o JOIN recovery_games q ON q.operation_id = o.operation_id), FALSE)
        AS "recoveryIdentityExact",
      ${privateColumns},
      (SELECT md5(value) || md5('production-source|' || value) FROM source_text)::CHAR(64) AS "sourceStateToken",
      (SELECT md5(value) || md5('production-public|' || value) FROM public_text)::CHAR(64) AS "publicStateToken",
      (SELECT md5(value) || md5('production-private|' || value) FROM unrelated_private_text)::CHAR(64)
        AS "unrelatedPrivateStateToken"
  `;
}

export async function readProductionPrivateWorkspaceImportBeforeState(
  target: ProductionPrivateWorkspaceImportTarget,
) {
  const { sql } = sdkRuntimeSqlContext();
  const withTables = allProductionTablesPresent(await productionTablePresence(sql));
  const query = withTables
    ? selectSnapshot(`
        target_workspaces AS MATERIALIZED (
          SELECT * FROM sdk_production_private_workspaces WHERE target_key = $1
        ), unrelated_private_text AS (
          SELECT ${unrelatedPrivateStateTextSql} AS value
        )
      `, `
        (SELECT COUNT(*) FROM target_workspaces)::INTEGER AS "targetWorkspaceRows",
        (SELECT COUNT(*) FROM sdk_production_private_workspace_games
          WHERE workspace_id IN (SELECT workspace_id FROM target_workspaces))::INTEGER AS "targetWorkspaceGameRows",
        (SELECT COUNT(*) FROM sdk_production_private_workspace_files
          WHERE workspace_id IN (SELECT workspace_id FROM target_workspaces))::INTEGER AS "targetWorkspaceFileRows"
      `)
    : selectSnapshot(`unrelated_private_text AS (
        SELECT '${productionPrivateWorkspaceImportEmptyUnrelatedPrivateStateText}'::TEXT AS value
      )`, `
        0::INTEGER AS "targetWorkspaceRows",
        0::INTEGER AS "targetWorkspaceGameRows",
        0::INTEGER AS "targetWorkspaceFileRows"
      `);
  const rows = await sql.query(query, [target]) as SnapshotRow[];
  return snapshotFrom(rows[0] ?? {});
}

type CompletedRow = Record<string, unknown>;

function readBackFrom(row: CompletedRow): ProductionPrivateWorkspaceImportReadBack {
  return {
    targetWorkspaceRows: count(row.targetWorkspaceRows) as 1,
    targetWorkspaceGameRows: count(row.targetWorkspaceGameRows),
    targetWorkspaceFileRows: count(row.targetWorkspaceFileRows),
    bundleSha256: token(row.bundleSha256),
    workspaceManifestSha256: token(row.workspaceManifestSha256),
    perGameLedgerSha256: token(row.perGameLedgerSha256),
    gameIdentitySetSha256: token(row.gameIdentitySetSha256),
    perGameIdentitySha256: token(row.perGameIdentitySha256),
    contentSetSha256: token(row.contentSetSha256),
    sourceStateToken: token(row.sourceStateToken),
    publicStateToken: token(row.publicStateToken),
    unrelatedPrivateStateToken: token(row.unrelatedPrivateStateToken),
    ownerBindingRows: count(row.ownerBindingRows) as 0,
    grantRows: count(row.grantRows) as 0,
    releaseRows: count(row.releaseRows) as 0,
    publicationRows: count(row.publicationRows) as 0,
    aliasRows: count(row.aliasRows) as 0,
    roomRows: count(row.roomRows) as 0,
  };
}

const completedProductionPrivateWorkspaceImportSelect = `
    SELECT
      o.target_key AS target,
      o.operation_id::TEXT AS "operationId",
      o.plan_receipt AS "planReceipt",
      o.bundle_sha256 AS "bundleSha256",
      o.workspace_manifest_sha256 AS "workspaceManifestSha256",
      o.per_game_ledger_sha256 AS "perGameLedgerSha256",
      o.game_identity_set_sha256 AS "gameIdentitySetSha256",
      o.per_game_identity_sha256 AS "perGameIdentitySha256",
      o.content_set_sha256 AS "contentSetSha256",
      o.source_state_token AS "sourceStateToken",
      o.public_state_token AS "publicStateToken",
      o.unrelated_private_state_token AS "unrelatedPrivateStateToken",
      1::INTEGER AS "targetWorkspaceRows",
      (SELECT COUNT(*) FROM sdk_production_private_workspace_games g WHERE g.workspace_id = w.workspace_id)::INTEGER
        AS "targetWorkspaceGameRows",
      (SELECT COUNT(*) FROM sdk_production_private_workspace_files f WHERE f.workspace_id = w.workspace_id)::INTEGER
        AS "targetWorkspaceFileRows",
      0::INTEGER AS "ownerBindingRows", 0::INTEGER AS "grantRows", 0::INTEGER AS "releaseRows",
      0::INTEGER AS "publicationRows", 0::INTEGER AS "aliasRows", 0::INTEGER AS "roomRows"
    FROM sdk_production_private_workspace_import_operations o
    JOIN sdk_production_private_workspaces w ON w.operation_id = o.operation_id
    WHERE o.operation_id = $1::UUID
      AND o.target_key = 'moi-lab2'
      AND o.operation_nonce = o.operation_id
      AND o.environment = 'production'
      AND o.intent = ${productionPrivateWorkspaceImportIntent}
      AND o.state = 'completed' AND o.phase = 'imported-private'
      AND o.terminal_receipt IS NOT NULL AND o.read_back_sha256 IS NOT NULL
      AND w.workspace_id = o.operation_id AND w.target_key = o.target_key
      AND w.environment = 'production' AND w.visibility = 'private-quarantined'
      AND w.owner_binding_state = 'unbound'
      AND w.bundle_bytes = o.bundle_bytes AND w.bundle_sha256 = o.bundle_sha256
      AND w.bundle_schema_version = o.bundle_schema_version AND w.game_count = o.game_count
      AND w.game_identity_set_sha256 = o.game_identity_set_sha256
      AND w.per_game_identity_sha256 = o.per_game_identity_sha256
      AND w.content_set_sha256 = o.content_set_sha256
      AND w.workspace_manifest_sha256 = o.workspace_manifest_sha256
      AND w.per_game_ledger_sha256 = o.per_game_ledger_sha256
      AND w.grants_created = 0 AND w.releases_created = 0 AND w.publications_created = 0
      AND w.aliases_created = 0 AND w.rooms_created = 0
      AND (SELECT COUNT(*) FROM sdk_production_private_workspace_games g
        WHERE g.workspace_id = w.workspace_id AND g.historical_restoration_claim = FALSE) = o.game_count
      AND (SELECT COALESCE(SUM(g.runtime_file_count), 0) FROM sdk_production_private_workspace_games g
        WHERE g.workspace_id = w.workspace_id) = o.runtime_file_count
      AND (SELECT COALESCE(SUM(g.runtime_bytes), 0) FROM sdk_production_private_workspace_games g
        WHERE g.workspace_id = w.workspace_id) = o.runtime_bytes
      AND (SELECT COUNT(*) FROM sdk_production_private_workspace_files f
        WHERE f.workspace_id = w.workspace_id AND octet_length(f.content_bytes) = f.byte_length) = o.runtime_file_count
`;

export async function readCompletedProductionPrivateWorkspaceImport(
  operationId: string,
): Promise<CompletedProductionPrivateWorkspaceImport | null> {
  const { sql } = sdkRuntimeSqlContext();
  if (!allProductionTablesPresent(await productionTablePresence(sql))) return null;
  const rows = await sql.query(completedProductionPrivateWorkspaceImportSelect, [operationId]) as CompletedRow[];
  const row = rows[0];
  if (!row) return null;
  return {
    target: "moi-lab2",
    operationId: token(row.operationId),
    planReceipt: token(row.planReceipt),
    bundleSha256: token(row.bundleSha256),
    readBack: readBackFrom(row),
  };
}

type DiagnosticStatus = "pass" | "fail" | "not-assessed";
type DiagnosticMultiplicity = "absent" | "unique" | "multiple" | "not-assessed";
type DiagnosticOperationState = "completed" | "pending" | "other" | "ambiguous" | "not-assessed";
type DiagnosticOperationPhase = "imported-private" | "ledger-recorded" | "other" | "ambiguous" | "not-assessed";

export type ProductionPrivateWorkspaceImportCompletionDiagnostic = {
  schemaVersion: 1;
  operationId: string;
  database: {
    canonicalReaderSelector: string;
    diagnosticSelector: string;
    selectorMatch: boolean;
    canonicalReaderFingerprint: string | null;
    diagnosticFingerprint: string | null;
    fingerprintMatch: boolean;
  };
  tables: {
    operations: DiagnosticStatus;
    workspaces: DiagnosticStatus;
    games: DiagnosticStatus;
    files: DiagnosticStatus;
  };
  operation: {
    row: DiagnosticMultiplicity;
    operationIdExact: DiagnosticStatus;
    nonceExact: DiagnosticStatus;
    environmentExact: DiagnosticStatus;
    intentExact: DiagnosticStatus;
    state: DiagnosticOperationState;
    phase: DiagnosticOperationPhase;
    terminalReceiptPresent: DiagnosticStatus;
    readBackShaPresent: DiagnosticStatus;
  };
  workspace: {
    join: DiagnosticMultiplicity;
    identityExact: DiagnosticStatus;
    targetExact: DiagnosticStatus;
    environmentExact: DiagnosticStatus;
    privateQuarantined: DiagnosticStatus;
    ownerUnbound: DiagnosticStatus;
  };
  integrity: {
    bundleMatch: DiagnosticStatus;
    manifestMatch: DiagnosticStatus;
    ledgerMatch: DiagnosticStatus;
    remainingHashesMatch: DiagnosticStatus;
    games2: DiagnosticStatus;
    runtimeFiles21: DiagnosticStatus;
    runtimeBytesMatch: DiagnosticStatus;
    fileByteIntegrity: DiagnosticStatus;
  };
  nonEffects: {
    grants0: DiagnosticStatus;
    releases0: DiagnosticStatus;
    publications0: DiagnosticStatus;
    aliases0: DiagnosticStatus;
    rooms0: DiagnosticStatus;
  };
  canonicalReader: {
    matched: boolean;
    excludedBy: Array<
      | "TABLES"
      | "OPERATION"
      | "TERMINAL"
      | "WORKSPACE"
      | "INTEGRITY"
      | "NON_EFFECTS"
    >;
  };
};

function diagnosticStatus(value: boolean, assessed: boolean): DiagnosticStatus {
  return assessed ? value ? "pass" : "fail" : "not-assessed";
}

function diagnosticMultiplicity(value: unknown, assessed: boolean): DiagnosticMultiplicity {
  if (!assessed) return "not-assessed";
  const count = Number(value);
  return count === 0 ? "absent" : count === 1 ? "unique" : Number.isSafeInteger(count) && count > 1 ? "multiple" : "not-assessed";
}

function all(row: Record<string, unknown>, key: string) {
  return row[key] === true;
}

type CompletionDiagnosticDatabaseContext = Pick<ReturnType<typeof sdkRuntimeSqlContext>,
  "selectedKey" | "fallbackUsed"> & {
  databaseTargetFingerprint?: string;
  databaseNameFingerprint?: string;
};

function safeDatabaseIdentityContext(context: Pick<ReturnType<typeof sdkRuntimeSqlContext>, "selectedKey" | "fallbackUsed">): CompletionDiagnosticDatabaseContext {
  const binding = resolveSdkDatabaseBinding();
  if (
    binding.selectedKey !== context.selectedKey
    || binding.fallbackUsed !== context.fallbackUsed
    || !binding.databaseUrl
  ) return context;
  try {
    const url = new URL(binding.databaseUrl);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
      || !url.hostname
      || !url.pathname.replace(/^\/+/, "")
    ) return context;
  } catch {
    return context;
  }
  const safe = createSdkDatabaseBindingDiagnostic({
    binding,
    observedSchemaVersion: 0,
    requiredSchemaVersion: 0,
  });
  if (
    !safe.databaseTargetFingerprint
    || !safe.databaseNameFingerprint
    || !/^[a-f0-9]{64}$/.test(safe.databaseTargetFingerprint)
    || !/^[a-f0-9]{64}$/.test(safe.databaseNameFingerprint)
  ) return context;
  return {
    ...context,
    databaseTargetFingerprint: safe.databaseTargetFingerprint,
    databaseNameFingerprint: safe.databaseNameFingerprint,
  };
}

function completionDatabaseFingerprint(context: CompletionDiagnosticDatabaseContext) {
  if (!context.databaseTargetFingerprint || !context.databaseNameFingerprint) return null;
  return `sdb_v1_${createHash("sha256")
    .update([context.selectedKey, context.fallbackUsed, context.databaseTargetFingerprint, context.databaseNameFingerprint].join("|"))
    .digest("base64url")}`;
}

function diagnosticState(
  row: Record<string, unknown>,
  multiplicity: DiagnosticMultiplicity,
): { state: DiagnosticOperationState; phase: DiagnosticOperationPhase } {
  if (multiplicity === "not-assessed") return { state: "not-assessed", phase: "not-assessed" };
  if (multiplicity === "absent") return { state: "other", phase: "other" };
  if (multiplicity === "multiple") return { state: "ambiguous", phase: "ambiguous" };
  return {
    state: all(row, "operationStateCompleted") ? "completed" : all(row, "operationStatePending") ? "pending" : "other",
    phase: all(row, "operationPhaseImported") ? "imported-private" : all(row, "operationPhaseLedger") ? "ledger-recorded" : "other",
  };
}

const productionPrivateWorkspaceImportDiagnosticSelect = `
  WITH operation_rows AS MATERIALIZED (
    SELECT * FROM sdk_production_private_workspace_import_operations WHERE operation_id = $1::UUID
  ), workspace_rows AS MATERIALIZED (
    SELECT w.*, o.target_key AS operation_target_key, o.bundle_bytes AS operation_bundle_bytes,
      o.bundle_sha256 AS operation_bundle_sha256, o.bundle_schema_version AS operation_bundle_schema_version,
      o.game_count AS operation_game_count, o.runtime_file_count AS operation_runtime_file_count,
      o.runtime_bytes AS operation_runtime_bytes, o.game_identity_set_sha256 AS operation_game_identity_set_sha256,
      o.per_game_identity_sha256 AS operation_per_game_identity_sha256,
      o.content_set_sha256 AS operation_content_set_sha256,
      o.workspace_manifest_sha256 AS operation_workspace_manifest_sha256,
      o.per_game_ledger_sha256 AS operation_per_game_ledger_sha256
    FROM sdk_production_private_workspaces w JOIN operation_rows o ON w.operation_id = o.operation_id
  ), game_rows AS MATERIALIZED (
    SELECT g.* FROM sdk_production_private_workspace_games g
    WHERE g.workspace_id IN (SELECT workspace_id FROM workspace_rows)
  ), file_rows AS MATERIALIZED (
    SELECT f.* FROM sdk_production_private_workspace_files f
    WHERE f.workspace_id IN (SELECT workspace_id FROM workspace_rows)
  ), canonical_reader_rows AS MATERIALIZED (
    ${completedProductionPrivateWorkspaceImportSelect}
  )
  SELECT
    (SELECT COUNT(*) FROM operation_rows)::INTEGER AS "operationRows",
    COALESCE((SELECT bool_and(operation_id::TEXT = $1) FROM operation_rows), FALSE) AS "operationIdExact",
    COALESCE((SELECT bool_and(operation_nonce = operation_id) FROM operation_rows), FALSE) AS "nonceExact",
    COALESCE((SELECT bool_and(environment = 'production') FROM operation_rows), FALSE) AS "operationEnvironmentExact",
    COALESCE((SELECT bool_and(intent = '${productionPrivateWorkspaceImportIntent}') FROM operation_rows), FALSE) AS "intentExact",
    COALESCE((SELECT bool_and(state = 'completed') FROM operation_rows), FALSE) AS "operationStateCompleted",
    COALESCE((SELECT bool_and(state = 'pending') FROM operation_rows), FALSE) AS "operationStatePending",
    COALESCE((SELECT bool_and(phase = 'imported-private') FROM operation_rows), FALSE) AS "operationPhaseImported",
    COALESCE((SELECT bool_and(phase = 'ledger-recorded') FROM operation_rows), FALSE) AS "operationPhaseLedger",
    COALESCE((SELECT bool_and(terminal_receipt IS NOT NULL) FROM operation_rows), FALSE) AS "terminalReceiptPresent",
    COALESCE((SELECT bool_and(read_back_sha256 IS NOT NULL) FROM operation_rows), FALSE) AS "readBackShaPresent",
    (SELECT COUNT(*) FROM workspace_rows)::INTEGER AS "workspaceRows",
    COALESCE((SELECT bool_and(workspace_id = operation_id) FROM workspace_rows), FALSE) AS "workspaceIdentityExact",
    COALESCE((SELECT bool_and(target_key = operation_target_key AND target_key = 'moi-lab2') FROM workspace_rows), FALSE) AS "workspaceTargetExact",
    COALESCE((SELECT bool_and(environment = 'production') FROM workspace_rows), FALSE) AS "workspaceEnvironmentExact",
    COALESCE((SELECT bool_and(visibility = 'private-quarantined') FROM workspace_rows), FALSE) AS "privateQuarantined",
    COALESCE((SELECT bool_and(owner_binding_state = 'unbound') FROM workspace_rows), FALSE) AS "ownerUnbound",
    COALESCE((SELECT bool_and(bundle_bytes = operation_bundle_bytes AND bundle_sha256 = operation_bundle_sha256
      AND bundle_schema_version = operation_bundle_schema_version) FROM workspace_rows), FALSE) AS "bundleMatch",
    COALESCE((SELECT bool_and(workspace_manifest_sha256 = operation_workspace_manifest_sha256) FROM workspace_rows), FALSE) AS "manifestMatch",
    COALESCE((SELECT bool_and(per_game_ledger_sha256 = operation_per_game_ledger_sha256) FROM workspace_rows), FALSE) AS "ledgerMatch",
    COALESCE((SELECT bool_and(game_identity_set_sha256 = operation_game_identity_set_sha256
      AND per_game_identity_sha256 = operation_per_game_identity_sha256
      AND content_set_sha256 = operation_content_set_sha256) FROM workspace_rows), FALSE) AS "remainingHashesMatch",
    COALESCE((SELECT bool_and(operation_game_count = 2) FROM workspace_rows), FALSE)
      AND (SELECT COUNT(*) FROM game_rows WHERE historical_restoration_claim = FALSE) = 2 AS "games2",
    COALESCE((SELECT bool_and(operation_runtime_file_count = 21) FROM workspace_rows), FALSE)
      AND (SELECT COUNT(*) FROM file_rows) = 21
      AND COALESCE((SELECT SUM(runtime_file_count) FROM game_rows), 0) = 21 AS "runtimeFiles21",
    COALESCE((SELECT bool_and(operation_runtime_bytes = (SELECT COALESCE(SUM(runtime_bytes), 0) FROM game_rows)) FROM workspace_rows), FALSE) AS "runtimeBytesMatch",
    COALESCE((SELECT bool_and((SELECT COUNT(*) FROM file_rows WHERE octet_length(content_bytes) = byte_length) = operation_runtime_file_count) FROM workspace_rows), FALSE) AS "fileByteIntegrity",
    COALESCE((SELECT bool_and(grants_created = 0) FROM workspace_rows), FALSE) AS "grants0",
    COALESCE((SELECT bool_and(releases_created = 0) FROM workspace_rows), FALSE) AS "releases0",
    COALESCE((SELECT bool_and(publications_created = 0) FROM workspace_rows), FALSE) AS "publications0",
    COALESCE((SELECT bool_and(aliases_created = 0) FROM workspace_rows), FALSE) AS "aliases0",
    COALESCE((SELECT bool_and(rooms_created = 0) FROM workspace_rows), FALSE) AS "rooms0",
    (SELECT COUNT(*) = 1 FROM canonical_reader_rows) AS "canonicalReaderMatched"
`;

/**
 * Runs a read-only, strict-allowlist diagnosis beside the canonical completed-import reader.
 * The canonical reader SQL is embedded above as `canonical_reader_rows`; do not duplicate or relax it.
 */
export function projectCompletedProductionPrivateWorkspaceImportDiagnostic(input: {
  operationId: string;
  tablePresence: ProductionPrivateWorkspaceImportTablePresence;
  databaseContext: CompletionDiagnosticDatabaseContext;
  row?: Record<string, unknown>;
}): ProductionPrivateWorkspaceImportCompletionDiagnostic {
  const { operationId, tablePresence, databaseContext, row = {} } = input;
  const tablesPresent = allProductionTablesPresent(tablePresence);
  const bindingFingerprint = completionDatabaseFingerprint(databaseContext);
  const database = {
    canonicalReaderSelector: databaseContext.selectedKey,
    diagnosticSelector: databaseContext.selectedKey,
    selectorMatch: true,
    canonicalReaderFingerprint: bindingFingerprint,
    diagnosticFingerprint: bindingFingerprint,
    fingerprintMatch: bindingFingerprint !== null,
  };
  const tables = {
    operations: diagnosticStatus(tablePresence.operations, true),
    workspaces: diagnosticStatus(tablePresence.workspaces, true),
    games: diagnosticStatus(tablePresence.games, true),
    files: diagnosticStatus(tablePresence.files, true),
  } as const;
  if (!tablesPresent) {
    return {
      schemaVersion: 1,
      operationId,
      database,
      tables,
      operation: { row: "not-assessed", operationIdExact: "not-assessed", nonceExact: "not-assessed", environmentExact: "not-assessed", intentExact: "not-assessed", state: "not-assessed", phase: "not-assessed", terminalReceiptPresent: "not-assessed", readBackShaPresent: "not-assessed" },
      workspace: { join: "not-assessed", identityExact: "not-assessed", targetExact: "not-assessed", environmentExact: "not-assessed", privateQuarantined: "not-assessed", ownerUnbound: "not-assessed" },
      integrity: { bundleMatch: "not-assessed", manifestMatch: "not-assessed", ledgerMatch: "not-assessed", remainingHashesMatch: "not-assessed", games2: "not-assessed", runtimeFiles21: "not-assessed", runtimeBytesMatch: "not-assessed", fileByteIntegrity: "not-assessed" },
      nonEffects: { grants0: "not-assessed", releases0: "not-assessed", publications0: "not-assessed", aliases0: "not-assessed", rooms0: "not-assessed" },
      canonicalReader: { matched: false, excludedBy: ["TABLES"] },
    };
  }

  const operationRow = diagnosticMultiplicity(row.operationRows, true);
  const workspaceJoin = diagnosticMultiplicity(row.workspaceRows, true);
  const state = diagnosticState(row, operationRow);
  const operation = {
    row: operationRow,
    operationIdExact: diagnosticStatus(all(row, "operationIdExact"), true),
    nonceExact: diagnosticStatus(all(row, "nonceExact"), true),
    environmentExact: diagnosticStatus(all(row, "operationEnvironmentExact"), true),
    intentExact: diagnosticStatus(all(row, "intentExact"), true),
    state: state.state,
    phase: state.phase,
    terminalReceiptPresent: diagnosticStatus(all(row, "terminalReceiptPresent"), true),
    readBackShaPresent: diagnosticStatus(all(row, "readBackShaPresent"), true),
  } as const;
  const workspace = {
    join: workspaceJoin,
    identityExact: diagnosticStatus(all(row, "workspaceIdentityExact"), true),
    targetExact: diagnosticStatus(all(row, "workspaceTargetExact"), true),
    environmentExact: diagnosticStatus(all(row, "workspaceEnvironmentExact"), true),
    privateQuarantined: diagnosticStatus(all(row, "privateQuarantined"), true),
    ownerUnbound: diagnosticStatus(all(row, "ownerUnbound"), true),
  } as const;
  const integrity = {
    bundleMatch: diagnosticStatus(all(row, "bundleMatch"), true),
    manifestMatch: diagnosticStatus(all(row, "manifestMatch"), true),
    ledgerMatch: diagnosticStatus(all(row, "ledgerMatch"), true),
    remainingHashesMatch: diagnosticStatus(all(row, "remainingHashesMatch"), true),
    games2: diagnosticStatus(all(row, "games2"), true),
    runtimeFiles21: diagnosticStatus(all(row, "runtimeFiles21"), true),
    runtimeBytesMatch: diagnosticStatus(all(row, "runtimeBytesMatch"), true),
    fileByteIntegrity: diagnosticStatus(all(row, "fileByteIntegrity"), true),
  } as const;
  const nonEffects = {
    grants0: diagnosticStatus(all(row, "grants0"), true),
    releases0: diagnosticStatus(all(row, "releases0"), true),
    publications0: diagnosticStatus(all(row, "publications0"), true),
    aliases0: diagnosticStatus(all(row, "aliases0"), true),
    rooms0: diagnosticStatus(all(row, "rooms0"), true),
  } as const;
  const excludedBy: ProductionPrivateWorkspaceImportCompletionDiagnostic["canonicalReader"]["excludedBy"] = [];
  if (!database.selectorMatch || !database.fingerprintMatch) excludedBy.push("TABLES");
  if (operation.row !== "unique" || operation.operationIdExact !== "pass" || operation.nonceExact !== "pass"
    || operation.environmentExact !== "pass" || operation.intentExact !== "pass"
    || operation.state !== "completed" || operation.phase !== "imported-private") excludedBy.push("OPERATION");
  if (operation.terminalReceiptPresent !== "pass" || operation.readBackShaPresent !== "pass") excludedBy.push("TERMINAL");
  if (workspace.join !== "unique" || workspace.identityExact !== "pass" || workspace.targetExact !== "pass"
    || workspace.environmentExact !== "pass" || workspace.privateQuarantined !== "pass" || workspace.ownerUnbound !== "pass") excludedBy.push("WORKSPACE");
  if (Object.values(integrity).some((value) => value !== "pass")) excludedBy.push("INTEGRITY");
  if (Object.values(nonEffects).some((value) => value !== "pass")) excludedBy.push("NON_EFFECTS");
  const matched = all(row, "canonicalReaderMatched") && excludedBy.length === 0;
  return { schemaVersion: 1, operationId, database, tables, operation, workspace, integrity, nonEffects, canonicalReader: { matched, excludedBy } };
}

/**
 * Runs a read-only, strict-allowlist diagnosis beside the canonical completed-import reader.
 * The canonical reader SQL is embedded above as `canonical_reader_rows`; do not duplicate or relax it.
 */
export async function diagnoseCompletedProductionPrivateWorkspaceImport(
  operationId: string,
): Promise<ProductionPrivateWorkspaceImportCompletionDiagnostic> {
  let context: ReturnType<typeof sdkRuntimeSqlContext>;
  try {
    context = sdkRuntimeSqlContext();
  } catch {
    throw new ProductionOwnerRestorationDiagnosticError(
      "OWNER_RESTORATION_DIAGNOSTIC_DATABASE_SELECTOR_UNAVAILABLE",
    );
  }
  let tablePresence: ProductionPrivateWorkspaceImportTablePresence;
  try {
    tablePresence = await productionTablePresence(context.sql);
  } catch (error) {
    throw new ProductionOwnerRestorationDiagnosticError(diagnosticQueryFailureCode(error));
  }
  const tablesPresent = allProductionTablesPresent(tablePresence);
  let row: Record<string, unknown> | undefined;
  if (tablesPresent) {
    try {
      row = (await context.sql.query(productionPrivateWorkspaceImportDiagnosticSelect, [operationId]) as Array<Record<string, unknown>>)[0] ?? {};
    } catch (error) {
      throw new ProductionOwnerRestorationDiagnosticError(diagnosticQueryFailureCode(error));
    }
  }
  try {
    return projectCompletedProductionPrivateWorkspaceImportDiagnostic({
      operationId,
      tablePresence,
      databaseContext: safeDatabaseIdentityContext(context),
      row,
    });
  } catch {
    throw new ProductionOwnerRestorationDiagnosticError(
      "OWNER_RESTORATION_DIAGNOSTIC_RESPONSE_PROJECTION_UNSUPPORTED",
    );
  }
}

type ExecutionRow = CompletedRow & { result?: unknown; replayed?: unknown; terminalReceipt?: unknown };

export async function importProductionPrivateWorkspaceAtomic(
  input: Parameters<ProductionPrivateWorkspaceImportAdapter["importAtomic"]>[0],
) {
  if (input.faultAt === "before-ledger") {
    throw new ProductionPrivateWorkspaceImportError("PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE");
  }
  const sql = sdkRuntimeSqlContext().sql;
  const games = input.bundle.games.map((game) => ({
    gameId: game.gameId,
    reconstructionMode: game.reconstructionMode,
    originalRevision: game.originalRevision,
    workspaceDocumentSha256: game.workspaceDocumentSha256,
    provenanceSha256: game.provenanceSha256,
    runtimeFilesSha256: game.runtimeFilesSha256,
    workspaceDocument: game.workspaceDocument,
    runtimeFileCount: game.runtimeFiles.length,
    runtimeBytes: game.runtimeFiles.reduce((total, file) => total + file.bytes, 0),
  }));
  const files = input.bundle.games.flatMap((game) => game.runtimeFiles.map((file) => ({
    gameId: game.gameId,
    path: file.path,
    bytes: file.bytes,
    sha256: file.sha256,
    contentBase64: file.content.toString("base64"),
  })));
  const statement = `
    WITH target_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtext('production-private-workspace-import:moi-lab2')) AS locked
    ), target_creators AS MATERIALIZED (
      SELECT c.* FROM target_lock, sdk_creators c WHERE c.slug = $1 FOR UPDATE
    ), target_games AS MATERIALIZED (
      SELECT g.* FROM sdk_games g WHERE g.creator_id IN (SELECT id FROM target_creators) FOR UPDATE
    ), target_packages AS MATERIALIZED (
      SELECT r.* FROM sdk_game_package_revisions r WHERE r.game_id IN (SELECT id FROM target_games) FOR UPDATE
    ), target_releases AS MATERIALIZED (
      SELECT r.* FROM sdk_app_releases r WHERE r.source_creator_slug = $1 FOR UPDATE
    ), recovery_operations AS MATERIALIZED (
      SELECT o.* FROM sdk_creator_recovery_operations o WHERE o.target_key = $1 FOR UPDATE
    ), recovery_games AS MATERIALIZED (
      SELECT q.* FROM sdk_creator_recovery_quarantine_games q
      WHERE q.game_id IN (SELECT id FROM target_games) FOR UPDATE
    ), existing AS MATERIALIZED (
      SELECT * FROM sdk_production_private_workspace_import_operations
      WHERE operation_id = $2::UUID OR target_key = $1 FOR UPDATE
    ), source_text AS (
      SELECT concat_ws('||',
        COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM target_creators r), ''),
        COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM target_games r), ''),
        COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY game_id, revision) FROM target_packages r), ''),
        COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM target_releases r), ''),
        COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY operation_id) FROM recovery_operations r), ''),
        COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY operation_id, game_id) FROM recovery_games r), '')
      ) AS value
    ), public_text AS (
      SELECT concat_ws('||',
        COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM sdk_app_releases r), ''),
        COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM sdk_release_decisions r), ''),
        COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM sdk_oauth_grants r), '')
      ) AS value
    ), unrelated_private_text AS (
      SELECT ${unrelatedPrivateStateTextSql} AS value
    ), shape AS MATERIALIZED (
      SELECT
        (SELECT id::TEXT FROM target_creators ORDER BY id LIMIT 1) AS creator_id,
        (SELECT COUNT(*) FROM target_creators)::INTEGER AS creator_rows,
        (SELECT COUNT(*) FROM target_creators WHERE deleted_at IS NOT NULL)::INTEGER AS deleted_creator_rows,
        (SELECT COUNT(*) FROM target_creators WHERE owner_player_id IS NOT NULL)::INTEGER AS creator_owner_rows,
        (SELECT COUNT(*) FROM target_games)::INTEGER AS game_rows,
        (SELECT COUNT(*) FROM target_games WHERE deleted_at IS NOT NULL)::INTEGER AS deleted_game_rows,
        (SELECT COUNT(*) FROM target_games WHERE deleted_at IS NULL)::INTEGER AS active_game_rows,
        (SELECT COUNT(*) FROM target_releases)::INTEGER AS release_rows,
        (SELECT COUNT(*) FROM target_releases WHERE is_current)::INTEGER AS current_release_rows,
        (SELECT COUNT(*) FROM recovery_operations)::INTEGER AS recovery_operation_rows,
        (SELECT COUNT(*) FROM recovery_games)::INTEGER AS recovery_game_rows,
        COALESCE((SELECT bool_and(
          o.operation_id = '${productionPrivateWorkspaceImportRecoveryIdentity.operationId}'::UUID
          AND o.terminal_receipt = '${productionPrivateWorkspaceImportRecoveryIdentity.terminalReceipt}'
          AND o.state = 'completed' AND o.phase = 'quarantined'
          AND q.recovery_state = 'quarantined' AND q.visibility = 'non-public'
          AND q.owner_binding_state = 'unbound' AND q.grant_state = 'blocked'
          AND q.release_state = 'blocked' AND q.publication_state = 'blocked'
        ) FROM recovery_operations o JOIN recovery_games q ON q.operation_id = o.operation_id), FALSE) AS recovery_exact,
        (SELECT md5(value) || md5('production-source|' || value) FROM source_text)::CHAR(64) AS source_token,
        (SELECT md5(value) || md5('production-public|' || value) FROM public_text)::CHAR(64) AS public_token,
        (SELECT md5(value) || md5('production-private|' || value) FROM unrelated_private_text)::CHAR(64) AS private_token
    ), eligible AS MATERIALIZED (
      SELECT * FROM shape s
      WHERE s.creator_id = $3
        AND s.creator_rows = 1 AND s.deleted_creator_rows = 1 AND s.creator_owner_rows = 0
        AND s.game_rows = $4 AND s.deleted_game_rows = $4 AND s.active_game_rows = 0
        AND s.release_rows = 0 AND s.current_release_rows = 0
        AND s.recovery_operation_rows = 1 AND s.recovery_game_rows = $4 AND s.recovery_exact
        AND s.source_token = $5 AND s.public_token = $6 AND s.private_token = $7
        AND NOT EXISTS (SELECT 1 FROM existing)
    ), input_games AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset($8::JSONB) AS g(
        "gameId" VARCHAR(64), "reconstructionMode" VARCHAR(48), "originalRevision" CHAR(40),
        "workspaceDocumentSha256" CHAR(64), "provenanceSha256" CHAR(64), "runtimeFilesSha256" CHAR(64),
        "workspaceDocument" JSONB, "runtimeFileCount" INTEGER, "runtimeBytes" INTEGER
      )
    ), input_files AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset($9::JSONB) AS f(
        "gameId" VARCHAR(64), path VARCHAR(1024), bytes INTEGER, sha256 CHAR(64), "contentBase64" TEXT
      )
    ), created_operation AS (
      INSERT INTO sdk_production_private_workspace_import_operations (
        operation_id, operation_nonce, target_key, environment, intent,
        recovery_operation_id, recovery_terminal_receipt, plan_receipt, terminal_receipt,
        bundle_bytes, bundle_sha256, bundle_schema_version, game_count, entry_count,
        runtime_file_count, runtime_bytes, game_identity_set_sha256, per_game_identity_sha256,
        content_set_sha256, workspace_manifest_sha256, per_game_ledger_sha256,
        before_state_sha256, source_state_token, public_state_token, unrelated_private_state_token,
        read_back_sha256, state, phase
      ) SELECT
        $2::UUID, $2::UUID, $1, 'production', '${productionPrivateWorkspaceImportIntent}',
        '${productionPrivateWorkspaceImportRecoveryIdentity.operationId}'::UUID,
        '${productionPrivateWorkspaceImportRecoveryIdentity.terminalReceipt}',
        $10, NULL, $11, $12, 1, $4, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $5, $6, $7, NULL, 'pending', 'ledger-recorded'
      FROM eligible RETURNING operation_id
    ), ledger_gate AS MATERIALIZED (
      SELECT 1 / CASE WHEN $22 = 'after-ledger' AND EXISTS (SELECT 1 FROM created_operation) THEN 0 ELSE 1 END AS ok
    ), created_workspace AS (
      INSERT INTO sdk_production_private_workspaces (
        workspace_id, operation_id, target_key, environment, visibility, owner_binding_state,
        bundle_bytes, bundle_sha256, bundle_schema_version, game_count,
        game_identity_set_sha256, per_game_identity_sha256, content_set_sha256,
        workspace_manifest_sha256, per_game_ledger_sha256, workspace_manifest
      ) SELECT o.operation_id, o.operation_id, $1, 'production', 'private-quarantined', 'unbound',
        $11, $12, 1, $4, $16, $17, $18, $19, $20, $23::JSONB
      FROM created_operation o CROSS JOIN ledger_gate RETURNING workspace_id
    ), workspace_gate AS MATERIALIZED (
      SELECT 1 / CASE WHEN $22 = 'after-workspace' AND EXISTS (SELECT 1 FROM created_workspace) THEN 0 ELSE 1 END AS ok
    ), created_games AS (
      INSERT INTO sdk_production_private_workspace_games (
        workspace_id, game_id, reconstruction_mode, original_revision, historical_restoration_claim,
        workspace_document_sha256, provenance_sha256, runtime_files_sha256, workspace_document,
        runtime_file_count, runtime_bytes
      ) SELECT w.workspace_id, g."gameId", g."reconstructionMode", g."originalRevision", FALSE,
        g."workspaceDocumentSha256", g."provenanceSha256", g."runtimeFilesSha256", g."workspaceDocument",
        g."runtimeFileCount", g."runtimeBytes"
      FROM created_workspace w CROSS JOIN input_games g CROSS JOIN workspace_gate RETURNING game_id
    ), game_gate AS MATERIALIZED (
      SELECT 1 / CASE WHEN $22 = 'after-games' AND EXISTS (SELECT 1 FROM created_games) THEN 0 ELSE 1 END AS ok
    ), created_files AS (
      INSERT INTO sdk_production_private_workspace_files (
        workspace_id, game_id, path, content_bytes, byte_length, content_sha256
      ) SELECT w.workspace_id, f."gameId", f.path, decode(f."contentBase64", 'base64'), f.bytes, f.sha256
      FROM created_workspace w CROSS JOIN input_files f CROSS JOIN game_gate RETURNING game_id, path
    ), file_gate AS MATERIALIZED (
      SELECT 1 / CASE WHEN $22 = 'after-files' AND EXISTS (SELECT 1 FROM created_files) THEN 0 ELSE 1 END AS ok
    ), counts AS MATERIALIZED (
      SELECT (SELECT COUNT(*) FROM created_workspace)::INTEGER AS workspace_rows,
        (SELECT COUNT(*) FROM created_games)::INTEGER AS game_rows,
        (SELECT COUNT(*) FROM created_files)::INTEGER AS file_rows FROM file_gate
    ), terminal_gate AS MATERIALIZED (
      SELECT 1 / CASE WHEN $22 = 'before-terminal' AND EXISTS (SELECT 1 FROM created_operation) THEN 0 ELSE 1 END AS ok
    ), completed AS (
      UPDATE sdk_production_private_workspace_import_operations o
      SET state = 'completed', phase = 'imported-private', terminal_receipt = $24,
        read_back_sha256 = $25, completed_at = NOW(), updated_at = NOW()
      FROM counts c, terminal_gate
      WHERE o.operation_id = $2::UUID AND o.state = 'pending'
        AND c.workspace_rows = 1 AND c.game_rows = $4 AND c.file_rows = $14
      RETURNING o.operation_id, o.terminal_receipt
    ), terminal AS (
      SELECT o.*, FALSE AS replayed FROM sdk_production_private_workspace_import_operations o
      JOIN completed c ON c.operation_id = o.operation_id
      UNION ALL
      SELECT o.*, TRUE AS replayed FROM existing o
      WHERE o.operation_id = $2::UUID AND o.target_key = $1
        AND o.plan_receipt = $10 AND o.bundle_sha256 = $12 AND o.state = 'completed'
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM existing WHERE operation_id <> $2::UUID OR target_key <> $1
        OR plan_receipt <> $10 OR bundle_sha256 <> $12) THEN 'OPERATION_CONFLICT'
      WHEN NOT EXISTS (SELECT 1 FROM eligible) AND NOT EXISTS (SELECT 1 FROM terminal) THEN 'CONCURRENT_CHANGE'
      WHEN EXISTS (SELECT 1 FROM terminal) THEN 'COMPLETED'
      ELSE 'UNAVAILABLE'
    END AS result,
    COALESCE((SELECT replayed FROM terminal LIMIT 1), FALSE) AS replayed,
    (SELECT terminal_receipt FROM terminal LIMIT 1) AS "terminalReceipt",
    $1 AS target, $2 AS "operationId", $10 AS "planReceipt", $12 AS "bundleSha256",
    $19 AS "workspaceManifestSha256", $20 AS "perGameLedgerSha256",
    $16 AS "gameIdentitySetSha256", $17 AS "perGameIdentitySha256", $18 AS "contentSetSha256",
    $5 AS "sourceStateToken", $6 AS "publicStateToken", $7 AS "unrelatedPrivateStateToken",
    1::INTEGER AS "targetWorkspaceRows", $4::INTEGER AS "targetWorkspaceGameRows",
    $14::INTEGER AS "targetWorkspaceFileRows", 0::INTEGER AS "ownerBindingRows",
    0::INTEGER AS "grantRows", 0::INTEGER AS "releaseRows", 0::INTEGER AS "publicationRows",
    0::INTEGER AS "aliasRows", 0::INTEGER AS "roomRows"
  `;
  const params = [
    input.bundle.target,
    input.operationId,
    input.beforeState.targetCreatorRowId,
    input.bundle.gameCount,
    input.beforeState.sourceStateToken,
    input.beforeState.publicStateToken,
    input.beforeState.unrelatedPrivateStateToken,
    JSON.stringify(games),
    JSON.stringify(files),
    input.planReceipt,
    input.bundle.bundleBytes,
    input.bundle.bundleSha256,
    input.bundle.entryCount,
    input.bundle.runtimeFileCount,
    input.bundle.runtimeBytes,
    input.bundle.gameIdentitySetSha256,
    input.bundle.perGameIdentitySha256,
    input.bundle.contentSetSha256,
    input.bundle.workspaceManifestSha256,
    input.bundle.perGameLedgerSha256,
    input.beforeStateSha256,
    input.faultAt ?? "",
    JSON.stringify(input.bundle.workspaceManifest),
    input.terminalReceipt,
    input.readBackSha256,
  ];
  const results = await sql.transaction((tx) => [
    ...productionPrivateWorkspaceImportSchemaStatements.map((source) => tx.query(source)),
    tx.query(statement, params),
  ], { isolationLevel: "Serializable" });
  const rows = results.at(-1) as ExecutionRow[];
  const result = rows?.[0] ?? {};
  if (result.result === "OPERATION_CONFLICT") {
    throw new ProductionPrivateWorkspaceImportError("PRODUCTION_PRIVATE_IMPORT_OPERATION_CONFLICT");
  }
  if (result.result === "CONCURRENT_CHANGE") {
    throw new ProductionPrivateWorkspaceImportError("PRODUCTION_PRIVATE_IMPORT_CONCURRENT_CHANGE");
  }
  if (result.result !== "COMPLETED" || result.terminalReceipt !== input.terminalReceipt) {
    throw new ProductionPrivateWorkspaceImportError("PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE");
  }
  return { replayed: result.replayed === true, readBack: readBackFrom(result) };
}

export const productionPrivateWorkspaceImportStore: ProductionPrivateWorkspaceImportAdapter = {
  readBeforeState: readProductionPrivateWorkspaceImportBeforeState,
  readCompletedOperation: readCompletedProductionPrivateWorkspaceImport,
  importAtomic: importProductionPrivateWorkspaceAtomic,
};
