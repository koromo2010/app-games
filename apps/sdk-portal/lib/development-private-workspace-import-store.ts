import {
  DevelopmentPrivateWorkspaceImportError,
  developmentPrivateWorkspaceImportIntent,
  type CompletedDevelopmentPrivateWorkspaceImport,
  type DevelopmentPrivateWorkspaceImportAdapter,
  type DevelopmentPrivateWorkspaceImportBeforeState,
  type DevelopmentPrivateWorkspaceImportReadBack,
  type DevelopmentPrivateWorkspaceImportTarget,
} from "./development-private-workspace-import.ts";
import { sdkSql } from "./sdk-postgres.ts";

type SnapshotRow = {
  targetCreatorRowId?: unknown;
  targetCreatorRows?: unknown;
  targetDeletedCreatorRows?: unknown;
  targetCreatorOwnerRows?: unknown;
  targetGameRows?: unknown;
  targetDeletedGameRows?: unknown;
  targetActiveGameRows?: unknown;
  targetReleaseRows?: unknown;
  targetCurrentReleaseRows?: unknown;
  targetWorkspaceRows?: unknown;
  targetWorkspaceGameRows?: unknown;
  targetWorkspaceFileRows?: unknown;
  sourceStateToken?: unknown;
  publicStateToken?: unknown;
  unrelatedPrivateStateToken?: unknown;
};

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : -1;
}

function token(value: unknown) {
  return typeof value === "string" ? value : "";
}

function snapshotFrom(row: SnapshotRow): DevelopmentPrivateWorkspaceImportBeforeState {
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
    targetWorkspaceRows: count(row.targetWorkspaceRows),
    targetWorkspaceGameRows: count(row.targetWorkspaceGameRows),
    targetWorkspaceFileRows: count(row.targetWorkspaceFileRows),
    sourceStateToken: token(row.sourceStateToken),
    publicStateToken: token(row.publicStateToken),
    unrelatedPrivateStateToken: token(row.unrelatedPrivateStateToken),
  };
}

export async function readDevelopmentPrivateWorkspaceImportBeforeState(
  target: DevelopmentPrivateWorkspaceImportTarget,
) {
  const sql = sdkSql();
  const rows = await sql`
    SELECT
      target_creator_row_id::TEXT AS "targetCreatorRowId",
      target_creator_rows AS "targetCreatorRows",
      target_deleted_creator_rows AS "targetDeletedCreatorRows",
      target_creator_owner_rows AS "targetCreatorOwnerRows",
      target_game_rows AS "targetGameRows",
      target_deleted_game_rows AS "targetDeletedGameRows",
      target_active_game_rows AS "targetActiveGameRows",
      target_release_rows AS "targetReleaseRows",
      target_current_release_rows AS "targetCurrentReleaseRows",
      target_workspace_rows AS "targetWorkspaceRows",
      target_workspace_game_rows AS "targetWorkspaceGameRows",
      target_workspace_file_rows AS "targetWorkspaceFileRows",
      source_state_token AS "sourceStateToken",
      public_state_token AS "publicStateToken",
      unrelated_private_state_token AS "unrelatedPrivateStateToken"
    FROM sdk_development_private_workspace_import_snapshot(${target})
  `;
  return snapshotFrom(((rows as unknown as SnapshotRow[])[0] ?? {}));
}

type CompletedRow = {
  target?: unknown;
  operationId?: unknown;
  planReceipt?: unknown;
  bundleSha256?: unknown;
  targetWorkspaceRows?: unknown;
  targetWorkspaceGameRows?: unknown;
  targetWorkspaceFileRows?: unknown;
  gameIdentitySetSha256?: unknown;
  perGameIdentitySha256?: unknown;
  contentSetSha256?: unknown;
  sourceStateToken?: unknown;
  publicStateToken?: unknown;
  unrelatedPrivateStateToken?: unknown;
  ownerBindingRows?: unknown;
  grantRows?: unknown;
  releaseRows?: unknown;
  publicationRows?: unknown;
  aliasRows?: unknown;
  roomRows?: unknown;
};

function readBackFrom(row: CompletedRow): DevelopmentPrivateWorkspaceImportReadBack {
  return {
    targetWorkspaceRows: count(row.targetWorkspaceRows) as 1,
    targetWorkspaceGameRows: count(row.targetWorkspaceGameRows),
    targetWorkspaceFileRows: count(row.targetWorkspaceFileRows),
    bundleSha256: token(row.bundleSha256),
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

export async function readCompletedDevelopmentPrivateWorkspaceImport(
  operationId: string,
): Promise<CompletedDevelopmentPrivateWorkspaceImport | null> {
  const sql = sdkSql();
  const rows = await sql`
    SELECT
      o.target_key AS target,
      o.operation_id::TEXT AS "operationId",
      o.plan_receipt AS "planReceipt",
      o.bundle_sha256 AS "bundleSha256",
      1::INTEGER AS "targetWorkspaceRows",
      o.game_count AS "targetWorkspaceGameRows",
      o.runtime_file_count AS "targetWorkspaceFileRows",
      o.game_identity_set_sha256 AS "gameIdentitySetSha256",
      o.per_game_identity_sha256 AS "perGameIdentitySha256",
      o.content_set_sha256 AS "contentSetSha256",
      o.source_state_token AS "sourceStateToken",
      o.public_state_token AS "publicStateToken",
      o.unrelated_private_state_token AS "unrelatedPrivateStateToken",
      0::INTEGER AS "ownerBindingRows",
      0::INTEGER AS "grantRows",
      0::INTEGER AS "releaseRows",
      0::INTEGER AS "publicationRows",
      0::INTEGER AS "aliasRows",
      0::INTEGER AS "roomRows"
    FROM sdk_development_private_workspace_import_operations o
    JOIN sdk_development_private_workspaces w ON w.operation_id = o.operation_id
    WHERE o.operation_id = ${operationId}::UUID
      AND o.state = 'completed'
      AND o.phase = 'imported-private'
      AND w.visibility = 'private-quarantined'
      AND w.owner_binding_state = 'unbound'
      AND w.grants_created = 0
      AND w.releases_created = 0
      AND w.publications_created = 0
      AND w.aliases_created = 0
      AND w.rooms_created = 0
  `;
  const row = (rows as unknown as CompletedRow[])[0];
  if (!row) return null;
  const target = row.target;
  if (target !== "moi-lab2" && target !== "yabobojpn-lab") {
    throw new DevelopmentPrivateWorkspaceImportError("DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE");
  }
  return {
    target,
    operationId: token(row.operationId),
    planReceipt: token(row.planReceipt),
    bundleSha256: token(row.bundleSha256),
    readBack: readBackFrom(row),
  };
}

type ExecutionRow = CompletedRow & {
  result?: unknown;
  replayed?: unknown;
  terminalReceipt?: unknown;
};

export async function importDevelopmentPrivateWorkspaceAtomic(
  input: Parameters<DevelopmentPrivateWorkspaceImportAdapter["importAtomic"]>[0],
) {
  if (input.faultAt === "before-ledger") {
    throw new DevelopmentPrivateWorkspaceImportError("DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE");
  }
  const sql = sdkSql();
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
  const [rows] = await sql.transaction((tx) => [tx`
    WITH target_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtext(${`private-workspace-import:${input.bundle.target}`})) AS locked
    ), snapshot_before AS MATERIALIZED (
      SELECT s.* FROM target_lock,
        sdk_development_private_workspace_import_snapshot(${input.bundle.target}) s
    ), existing AS MATERIALIZED (
      SELECT * FROM sdk_development_private_workspace_import_operations
      WHERE operation_id = ${input.operationId}::UUID OR target_key = ${input.bundle.target}
      FOR UPDATE
    ), eligible AS MATERIALIZED (
      SELECT * FROM snapshot_before
      WHERE target_creator_row_id = ${input.beforeState.targetCreatorRowId}::UUID
        AND target_creator_rows = ${input.beforeState.targetCreatorRows}
        AND target_deleted_creator_rows = ${input.beforeState.targetDeletedCreatorRows}
        AND target_creator_owner_rows = ${input.beforeState.targetCreatorOwnerRows}
        AND target_game_rows = ${input.beforeState.targetGameRows}
        AND target_deleted_game_rows = ${input.beforeState.targetDeletedGameRows}
        AND target_active_game_rows = ${input.beforeState.targetActiveGameRows}
        AND target_release_rows = ${input.beforeState.targetReleaseRows}
        AND target_current_release_rows = ${input.beforeState.targetCurrentReleaseRows}
        AND target_workspace_rows = 0
        AND target_workspace_game_rows = 0
        AND target_workspace_file_rows = 0
        AND source_state_token = ${input.beforeState.sourceStateToken}
        AND public_state_token = ${input.beforeState.publicStateToken}
        AND unrelated_private_state_token = ${input.beforeState.unrelatedPrivateStateToken}
        AND NOT EXISTS (SELECT 1 FROM existing)
    ), input_games AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(games)}::JSONB) AS g(
        "gameId" VARCHAR(64),
        "reconstructionMode" VARCHAR(48),
        "originalRevision" CHAR(40),
        "workspaceDocumentSha256" CHAR(64),
        "provenanceSha256" CHAR(64),
        "runtimeFilesSha256" CHAR(64),
        "workspaceDocument" JSONB,
        "runtimeFileCount" INTEGER,
        "runtimeBytes" INTEGER
      )
    ), input_files AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(files)}::JSONB) AS f(
        "gameId" VARCHAR(64),
        path VARCHAR(1024),
        bytes INTEGER,
        sha256 CHAR(64),
        "contentBase64" TEXT
      )
    ), created_operation AS (
      INSERT INTO sdk_development_private_workspace_import_operations (
        operation_id, operation_nonce, target_key, environment, intent,
        plan_receipt, terminal_receipt, bundle_bytes, bundle_sha256,
        bundle_schema_version, game_count, game_identity_set_sha256,
        per_game_identity_sha256, content_set_sha256, workspace_manifest_sha256,
        per_game_ledger_sha256, runtime_file_count, runtime_bytes,
        before_state_sha256, source_state_token, public_state_token,
        unrelated_private_state_token, read_back_sha256, state, phase
      )
      SELECT
        ${input.operationId}::UUID, ${input.operationId}::UUID,
        ${input.bundle.target}, 'development', ${developmentPrivateWorkspaceImportIntent},
        ${input.planReceipt}, NULL, ${input.bundle.bundleBytes}, ${input.bundle.bundleSha256},
        ${input.bundle.schemaVersion}, ${input.bundle.gameCount}, ${input.bundle.gameIdentitySetSha256},
        ${input.bundle.perGameIdentitySha256}, ${input.bundle.contentSetSha256},
        ${input.bundle.workspaceManifestSha256}, ${input.bundle.perGameLedgerSha256},
        ${input.bundle.runtimeFileCount}, ${input.bundle.runtimeBytes},
        ${input.beforeStateSha256}, ${input.beforeState.sourceStateToken},
        ${input.beforeState.publicStateToken}, ${input.beforeState.unrelatedPrivateStateToken},
        NULL, 'pending', 'ledger-recorded'
      FROM eligible
      RETURNING operation_id
    ), ledger_gate AS MATERIALIZED (
      SELECT 1 / CASE WHEN ${input.faultAt === "after-ledger"}
        AND EXISTS (SELECT 1 FROM created_operation) THEN 0 ELSE 1 END AS ok
    ), created_workspace AS (
      INSERT INTO sdk_development_private_workspaces (
        workspace_id, operation_id, target_key, environment, visibility,
        owner_binding_state, bundle_bytes, bundle_sha256, bundle_schema_version,
        game_count, game_identity_set_sha256, per_game_identity_sha256,
        content_set_sha256, workspace_manifest_sha256, workspace_manifest
      )
      SELECT
        o.operation_id, o.operation_id, ${input.bundle.target}, 'development',
        'private-quarantined', 'unbound', ${input.bundle.bundleBytes},
        ${input.bundle.bundleSha256}, ${input.bundle.schemaVersion},
        ${input.bundle.gameCount}, ${input.bundle.gameIdentitySetSha256},
        ${input.bundle.perGameIdentitySha256}, ${input.bundle.contentSetSha256},
        ${input.bundle.workspaceManifestSha256}, ${JSON.stringify(input.bundle.workspaceManifest)}::JSONB
      FROM created_operation o CROSS JOIN ledger_gate
      RETURNING workspace_id
    ), workspace_gate AS MATERIALIZED (
      SELECT 1 / CASE WHEN ${input.faultAt === "after-workspace"}
        AND EXISTS (SELECT 1 FROM created_workspace) THEN 0 ELSE 1 END AS ok
    ), created_games AS (
      INSERT INTO sdk_development_private_workspace_games (
        workspace_id, game_id, reconstruction_mode, original_revision,
        historical_restoration_claim, workspace_document_sha256,
        provenance_sha256, runtime_files_sha256, workspace_document,
        runtime_file_count, runtime_bytes
      )
      SELECT
        w.workspace_id, g."gameId", g."reconstructionMode", g."originalRevision",
        FALSE, g."workspaceDocumentSha256", g."provenanceSha256",
        g."runtimeFilesSha256", g."workspaceDocument", g."runtimeFileCount", g."runtimeBytes"
      FROM created_workspace w CROSS JOIN input_games g CROSS JOIN workspace_gate
      RETURNING game_id
    ), game_gate AS MATERIALIZED (
      SELECT 1 / CASE WHEN ${input.faultAt === "after-games"}
        AND EXISTS (SELECT 1 FROM created_games) THEN 0 ELSE 1 END AS ok
    ), created_files AS (
      INSERT INTO sdk_development_private_workspace_files (
        workspace_id, game_id, path, content_bytes, byte_length, content_sha256
      )
      SELECT
        w.workspace_id, f."gameId", f.path, decode(f."contentBase64", 'base64'),
        f.bytes, f.sha256
      FROM created_workspace w CROSS JOIN input_files f CROSS JOIN game_gate
      RETURNING game_id, path
    ), file_gate AS MATERIALIZED (
      SELECT 1 / CASE WHEN ${input.faultAt === "after-files"}
        AND EXISTS (SELECT 1 FROM created_files) THEN 0 ELSE 1 END AS ok
    ), counts AS MATERIALIZED (
      SELECT
        (SELECT COUNT(*) FROM created_workspace)::INTEGER AS workspace_rows,
        (SELECT COUNT(*) FROM created_games)::INTEGER AS game_rows,
        (SELECT COUNT(*) FROM created_files)::INTEGER AS file_rows
      FROM file_gate
    ), terminal_gate AS MATERIALIZED (
      SELECT 1 / CASE WHEN ${input.faultAt === "before-terminal"}
        AND EXISTS (SELECT 1 FROM created_operation) THEN 0 ELSE 1 END AS ok
    ), snapshot_after AS MATERIALIZED (
      SELECT s.* FROM terminal_gate,
        sdk_development_private_workspace_import_snapshot(${input.bundle.target}) s
    ), completed AS (
      UPDATE sdk_development_private_workspace_import_operations o
      SET state = 'completed', phase = 'imported-private',
        terminal_receipt = ${input.terminalReceipt},
        read_back_sha256 = ${input.readBackSha256},
        completed_at = NOW(), updated_at = NOW()
      FROM counts c, snapshot_after s
      WHERE o.operation_id = ${input.operationId}::UUID
        AND o.state = 'pending'
        AND c.workspace_rows = 1
        AND c.game_rows = ${input.bundle.gameCount}
        AND c.file_rows = ${input.bundle.runtimeFileCount}
        AND s.target_workspace_rows = 1
        AND s.target_workspace_game_rows = ${input.bundle.gameCount}
        AND s.target_workspace_file_rows = ${input.bundle.runtimeFileCount}
        AND s.source_state_token = ${input.beforeState.sourceStateToken}
        AND s.public_state_token = ${input.beforeState.publicStateToken}
        AND s.unrelated_private_state_token = ${input.beforeState.unrelatedPrivateStateToken}
      RETURNING o.operation_id, o.terminal_receipt
    ), terminal_dependency AS MATERIALIZED (
      SELECT (SELECT COUNT(*) FROM completed) + (SELECT COUNT(*) FROM existing) AS rows_seen
    ), final_snapshot AS MATERIALIZED (
      SELECT s.* FROM terminal_dependency,
        LATERAL sdk_development_private_workspace_import_snapshot(${input.bundle.target}) s
    ), terminal AS (
      SELECT o.*, FALSE AS replayed
      FROM sdk_development_private_workspace_import_operations o
      JOIN completed c ON c.operation_id = o.operation_id
      UNION ALL
      SELECT o.*, TRUE AS replayed
      FROM existing o
      WHERE o.operation_id = ${input.operationId}::UUID
        AND o.target_key = ${input.bundle.target}
        AND o.plan_receipt = ${input.planReceipt}
        AND o.bundle_sha256 = ${input.bundle.bundleSha256}
        AND o.state = 'completed'
    )
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM existing WHERE operation_id <> ${input.operationId}::UUID
          OR target_key <> ${input.bundle.target}
          OR plan_receipt <> ${input.planReceipt}
          OR bundle_sha256 <> ${input.bundle.bundleSha256}) THEN 'OPERATION_CONFLICT'
        WHEN NOT EXISTS (SELECT 1 FROM eligible) AND NOT EXISTS (SELECT 1 FROM terminal) THEN 'CONCURRENT_CHANGE'
        WHEN EXISTS (SELECT 1 FROM terminal) THEN 'COMPLETED'
        ELSE 'UNAVAILABLE'
      END AS result,
      COALESCE((SELECT replayed FROM terminal LIMIT 1), FALSE) AS replayed,
      (SELECT terminal_receipt FROM terminal LIMIT 1) AS "terminalReceipt",
      ${input.bundle.target} AS target,
      ${input.operationId} AS "operationId",
      ${input.planReceipt} AS "planReceipt",
      ${input.bundle.bundleSha256} AS "bundleSha256",
      (SELECT target_workspace_rows FROM final_snapshot)::INTEGER AS "targetWorkspaceRows",
      (SELECT target_workspace_game_rows FROM final_snapshot)::INTEGER AS "targetWorkspaceGameRows",
      (SELECT target_workspace_file_rows FROM final_snapshot)::INTEGER AS "targetWorkspaceFileRows",
      ${input.bundle.gameIdentitySetSha256} AS "gameIdentitySetSha256",
      ${input.bundle.perGameIdentitySha256} AS "perGameIdentitySha256",
      ${input.bundle.contentSetSha256} AS "contentSetSha256",
      (SELECT source_state_token FROM final_snapshot) AS "sourceStateToken",
      (SELECT public_state_token FROM final_snapshot) AS "publicStateToken",
      (SELECT unrelated_private_state_token FROM final_snapshot) AS "unrelatedPrivateStateToken",
      0::INTEGER AS "ownerBindingRows",
      0::INTEGER AS "grantRows",
      0::INTEGER AS "releaseRows",
      0::INTEGER AS "publicationRows",
      0::INTEGER AS "aliasRows",
      0::INTEGER AS "roomRows"
  `], { isolationLevel: "Serializable" });
  const result = ((rows as unknown as ExecutionRow[])[0] ?? {}) as ExecutionRow;
  if (result.result === "OPERATION_CONFLICT") {
    throw new DevelopmentPrivateWorkspaceImportError("DEVELOPMENT_PRIVATE_IMPORT_OPERATION_CONFLICT");
  }
  if (result.result === "CONCURRENT_CHANGE") {
    throw new DevelopmentPrivateWorkspaceImportError("DEVELOPMENT_PRIVATE_IMPORT_CONCURRENT_CHANGE");
  }
  if (result.result !== "COMPLETED" || result.terminalReceipt !== input.terminalReceipt) {
    throw new DevelopmentPrivateWorkspaceImportError("DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE");
  }
  return { replayed: result.replayed === true, readBack: readBackFrom(result) };
}

export const developmentPrivateWorkspaceImportStore: DevelopmentPrivateWorkspaceImportAdapter = {
  readBeforeState: readDevelopmentPrivateWorkspaceImportBeforeState,
  readCompletedOperation: readCompletedDevelopmentPrivateWorkspaceImport,
  importAtomic: importDevelopmentPrivateWorkspaceAtomic,
};
