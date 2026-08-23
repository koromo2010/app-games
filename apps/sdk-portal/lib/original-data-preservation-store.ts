import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { SdkDatabaseBinding } from "./sdk-database-binding-diagnostic.ts";
import {
  canonicalOriginalDataPreservationJson,
  OriginalDataPreservationError,
  originalDataPreservationFingerprint,
  originalDataPreservationRecordTables,
  originalDataPreservationTargets,
  type OriginalDataPreservationLedgerRow,
  type OriginalDataPreservationRecordTable,
  type OriginalDataPreservationSnapshot,
  type OriginalDataPreservationTarget,
  type OriginalDataPreservationTargetSnapshot,
} from "./original-data-preservation.ts";

type JsonRow = Record<string, unknown>;

type SnapshotMetaRow = {
  observed_at?: unknown;
  isolation_level?: unknown;
  transaction_read_only?: unknown;
  snapshot_id?: unknown;
};

export type OriginalDataPreservationStoreInput = {
  sql: NeonQueryFunction<boolean, boolean>;
  binding: SdkDatabaseBinding;
  secret: string;
  sourceMainCommit: string;
  sourceDeploymentIdentity: string;
};

function rows(value: unknown): JsonRow[] {
  if (!Array.isArray(value) || value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
  }
  return value as JsonRow[];
}

function text(row: JsonRow, key: string) {
  return typeof row[key] === "string" ? row[key] as string : null;
}

function timestamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string") {
    throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
  }
  return parsed.toISOString();
}

function emptyRecords() {
  const records = {} as Record<OriginalDataPreservationRecordTable, JsonRow[]>;
  for (const table of originalDataPreservationRecordTables) records[table] = [];
  return records;
}

function targetForLineage(value: string | null): OriginalDataPreservationTarget | null {
  return originalDataPreservationTargets.find((target) => value?.startsWith(`${target}/`)) ?? null;
}

function push(
  targets: Map<OriginalDataPreservationTarget, OriginalDataPreservationTargetSnapshot>,
  target: OriginalDataPreservationTarget | null,
  table: OriginalDataPreservationRecordTable,
  row: JsonRow,
) {
  if (!target) throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
  targets.get(target)!.records[table].push(row);
}

/**
 * Reads both exact targets inside one schema-9 REPEATABLE READ / READ ONLY
 * transaction. Every SELECT is an explicit table/column allowlist; no caller
 * value can expand the target set, source, table, or SQL.
 */
export async function readOriginalDataPreservationSnapshot(
  input: OriginalDataPreservationStoreInput,
): Promise<OriginalDataPreservationSnapshot> {
  if (
    input.binding.selectedKey !== "SDK_DATABASE_URL"
    || input.binding.fallbackUsed
    || !input.binding.databaseUrl
    || !/^[0-9a-f]{40}$/.test(input.sourceMainCommit)
    || !input.sourceDeploymentIdentity
  ) {
    throw new OriginalDataPreservationError("A0_SOURCE_IDENTITY_INVALID");
  }
  const targetA = originalDataPreservationTargets[0];
  const targetB = originalDataPreservationTargets[1];
  let results: unknown[];
  try {
    results = await input.sql.transaction((tx) => [
      tx`
        SELECT
          transaction_timestamp() AS observed_at,
          current_setting('transaction_isolation') AS isolation_level,
          current_setting('transaction_read_only') AS transaction_read_only,
          txid_current_snapshot()::TEXT AS snapshot_id
      `,
      tx`
        SELECT version, name, checksum, applied_at
        FROM sdk_schema_migrations
        ORDER BY version
      `,
      tx`
        SELECT id, slug, display_name, owner_player_id, created_at, updated_at, deleted_at
        FROM sdk_creators
        WHERE slug IN (${targetA}, ${targetB})
        ORDER BY slug
      `,
      tx`
        SELECT
          g.id, g.creator_id, g.game_id, g.title, g.description, g.manifest,
          g.sdk_package_version, g.sdk_contract_version, g.status,
          g.created_at, g.updated_at, g.module_policy, g.mock_revision,
          g.package_revision, g.package_bundle_sha256, g.package_app_set_sha256,
          g.development_revision, g.development_bundle_sha256,
          g.development_app_set_sha256, g.development_manifest,
          g.stable_revision, g.stable_bundle_sha256, g.stable_app_set_sha256,
          g.stable_manifest, g.public_game_id, g.package_root_sha256,
          g.development_root_sha256, g.stable_root_sha256, g.deleted_at,
          g.mock_approved_revision, g.mock_approved_at,
          g.mock_approved_by_player_id, g.module_profile_revision,
          g.module_contract_digest, g.module_profile_confirmed_at,
          g.module_profile_confirmed_by_player_id,
          g.prototype_module_profile_revision, g.prototype_module_contract_digest,
          g.prototype_sdk_package_version, g.prototype_source_sha256
        FROM sdk_games g
        JOIN sdk_creators c ON c.id = g.creator_id
        WHERE c.slug IN (${targetA}, ${targetB})
        ORDER BY c.slug, g.game_id, g.id
      `,
      tx`
        SELECT
          r.game_id, r.revision, r.package_root_sha256,
          r.server_bundle_sha256, r.app_set_source_sha256, r.manifest,
          r.sdk_package_version, r.sdk_contract_version, r.created_at,
          r.module_profile_revision, r.module_contract_digest,
          r.prototype_revision, r.shared_source_sha256
        FROM sdk_game_package_revisions r
        JOIN sdk_games g ON g.id = r.game_id
        JOIN sdk_creators c ON c.id = g.creator_id
        WHERE c.slug IN (${targetA}, ${targetB})
        ORDER BY c.slug, r.game_id, r.revision
      `,
      tx`
        SELECT h.id, h.game_id, h.channel, h.revision,
               h.package_root_sha256, h.promoted_at
        FROM sdk_game_channel_history h
        JOIN sdk_games g ON g.id = h.game_id
        JOIN sdk_creators c ON c.id = g.creator_id
        WHERE c.slug IN (${targetA}, ${targetB})
        ORDER BY c.slug, h.game_id, h.promoted_at, h.id
      `,
      tx`
        SELECT
          r.id, r.lineage_id, r.public_game_id, r.source_creator_slug,
          r.source_game_id, r.title, r.description, r.revision,
          r.package_root_sha256, r.server_bundle_sha256,
          r.app_set_source_sha256, r.manifest, r.module_policy,
          r.source_environment, r.release_kind, r.restored_from,
          r.is_current, r.released_at, r.source_revision
        FROM sdk_app_releases r
        WHERE r.source_creator_slug IN (${targetA}, ${targetB})
        ORDER BY r.source_creator_slug, r.lineage_id, r.released_at, r.id
      `,
      tx`
        SELECT
          d.id, d.lineage_id, d.public_game_id, d.route, d.action,
          d.source_environment, d.target_environment, d.revision,
          d.package_root_sha256, d.server_bundle_sha256,
          d.app_set_source_sha256, d.reason, d.actor_ref,
          d.release_id, d.decided_at
        FROM sdk_release_decisions d
        WHERE d.lineage_id IN (
          SELECT c.slug || '/' || g.game_id
          FROM sdk_games g
          JOIN sdk_creators c ON c.id = g.creator_id
          WHERE c.slug IN (${targetA}, ${targetB})
        ) OR d.release_id IN (
          SELECT r.id FROM sdk_app_releases r
          WHERE r.source_creator_slug IN (${targetA}, ${targetB})
        )
        ORDER BY d.lineage_id, d.decided_at, d.id
      `,
      tx`
        SELECT
          p.id, p.creator_id, p.game_row_id, p.game_id,
          p.proposer_client, p.environment, p.request_id,
          p.base_module_profile_revision, p.base_module_contract_digest,
          p.catalog_digest, p.specification, p.proposed_profile, p.diff,
          p.dependencies, p.impact, p.warnings, p.status,
          p.approved_by_player_id, p.approved_at, p.created_at, p.updated_at
        FROM sdk_game_module_profile_proposals p
        JOIN sdk_creators c ON c.id = p.creator_id
        WHERE c.slug IN (${targetA}, ${targetB})
        ORDER BY c.slug, p.game_row_id, p.created_at, p.id
      `,
      tx`
        SELECT
          a.id, a.proposal_id, a.creator_id, a.game_row_id,
          a.action, a.actor_kind, a.actor_player_id, a.actor_client,
          a.base_module_profile_revision, a.base_module_contract_digest,
          a.new_module_profile_revision, a.new_module_contract_digest,
          a.diff, a.created_at
        FROM sdk_game_module_profile_audit a
        JOIN sdk_creators c ON c.id = a.creator_id
        WHERE c.slug IN (${targetA}, ${targetB})
        ORDER BY c.slug, a.game_row_id, a.created_at, a.id
      `,
      tx`
        SELECT
          g.id, g.client_id, g.player_id, g.scope, g.audience,
          g.access_expires_at, g.refresh_expires_at,
          g.revoked_at, g.created_at
        FROM sdk_oauth_grants g
        WHERE g.player_id IN (
          SELECT c.owner_player_id FROM sdk_creators c
          WHERE c.slug IN (${targetA}, ${targetB})
            AND c.owner_player_id IS NOT NULL
        )
        ORDER BY g.player_id, g.created_at, g.id
      `,
      tx`
        SELECT
          c.client_id, c.redirect_uri, c.player_id, c.scope,
          c.audience, c.expires_at, c.created_at
        FROM sdk_oauth_codes c
        WHERE c.player_id IN (
          SELECT creator.owner_player_id FROM sdk_creators creator
          WHERE creator.slug IN (${targetA}, ${targetB})
            AND creator.owner_player_id IS NOT NULL
        )
        ORDER BY c.player_id, c.created_at, c.client_id
      `,
      tx`
        SELECT c.client_id, c.client_name, c.redirect_uris, c.created_at
        FROM sdk_oauth_clients c
        WHERE c.client_id IN (
          SELECT g.client_id FROM sdk_oauth_grants g
          WHERE g.player_id IN (
            SELECT creator.owner_player_id FROM sdk_creators creator
            WHERE creator.slug IN (${targetA}, ${targetB})
              AND creator.owner_player_id IS NOT NULL
          )
          UNION
          SELECT code.client_id FROM sdk_oauth_codes code
          WHERE code.player_id IN (
            SELECT creator.owner_player_id FROM sdk_creators creator
            WHERE creator.slug IN (${targetA}, ${targetB})
              AND creator.owner_player_id IS NOT NULL
          )
        )
        ORDER BY c.client_id
      `,
    ], { isolationLevel: "RepeatableRead", readOnly: true }) as unknown[];
  } catch (error) {
    const postgresCode = error && typeof error === "object"
      ? (error as { code?: unknown }).code
      : null;
    throw new OriginalDataPreservationError(
      postgresCode === "42P01" || postgresCode === "42703"
        ? "A0_SCHEMA_PRECONDITION_FAILED"
        : "A0_EXPORT_UNAVAILABLE",
    );
  }
  if (!Array.isArray(results) || results.length !== 13) {
    throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
  }
  const [
    metaRows,
    ledgerRows,
    creatorRows,
    gameRows,
    revisionRows,
    channelRows,
    releaseRows,
    decisionRows,
    proposalRows,
    auditRows,
    grantRows,
    codeRows,
    clientRows,
  ] = results.map(rows);
  const meta = metaRows[0] as SnapshotMetaRow | undefined;
  if (
    metaRows.length !== 1
    || !meta
    || String(meta.isolation_level).toLowerCase() !== "repeatable read"
    || !["on", "true"].includes(String(meta.transaction_read_only).toLowerCase())
    || typeof meta.snapshot_id !== "string"
    || !meta.snapshot_id
  ) {
    throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
  }
  const observedAt = timestamp(meta.observed_at);
  const ledger = ledgerRows as OriginalDataPreservationLedgerRow[];

  const targets = new Map<OriginalDataPreservationTarget, OriginalDataPreservationTargetSnapshot>(
    originalDataPreservationTargets.map((target) => [target, { target, records: emptyRecords() }]),
  );
  const targetByCreatorId = new Map<string, OriginalDataPreservationTarget>();
  const targetByGameRowId = new Map<string, OriginalDataPreservationTarget>();
  const targetByOwnerPlayerId = new Map<string, OriginalDataPreservationTarget[]>();
  for (const creator of creatorRows) {
    const target = originalDataPreservationTargets.find((candidate) => candidate === text(creator, "slug")) ?? null;
    push(targets, target, "sdk_creators", creator);
    const creatorId = text(creator, "id");
    if (!creatorId || !target) throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
    targetByCreatorId.set(creatorId, target);
    const ownerPlayerId = text(creator, "owner_player_id");
    if (ownerPlayerId) {
      targetByOwnerPlayerId.set(
        ownerPlayerId,
        [...(targetByOwnerPlayerId.get(ownerPlayerId) ?? []), target],
      );
    }
  }
  for (const game of gameRows) {
    const target = targetByCreatorId.get(text(game, "creator_id") ?? "") ?? null;
    push(targets, target, "sdk_games", game);
    const gameRowId = text(game, "id");
    if (!gameRowId || !target) throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
    targetByGameRowId.set(gameRowId, target);
  }
  for (const revision of revisionRows) {
    push(targets, targetByGameRowId.get(text(revision, "game_id") ?? "") ?? null, "sdk_game_package_revisions", revision);
  }
  for (const channel of channelRows) {
    push(targets, targetByGameRowId.get(text(channel, "game_id") ?? "") ?? null, "sdk_game_channel_history", channel);
  }
  const targetByReleaseId = new Map<string, OriginalDataPreservationTarget>();
  for (const release of releaseRows) {
    const target = originalDataPreservationTargets.find((candidate) => candidate === text(release, "source_creator_slug")) ?? null;
    push(targets, target, "sdk_app_releases", release);
    const releaseId = text(release, "id");
    if (!releaseId || !target) throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
    targetByReleaseId.set(releaseId, target);
  }
  for (const decision of decisionRows) {
    const lineageTarget = targetForLineage(text(decision, "lineage_id"));
    const releaseId = text(decision, "release_id");
    const releaseTarget = releaseId ? targetByReleaseId.get(releaseId) ?? null : null;
    if (releaseTarget && lineageTarget !== releaseTarget) {
      throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
    }
    push(targets, lineageTarget ?? releaseTarget, "sdk_release_decisions", decision);
  }
  for (const proposal of proposalRows) {
    push(targets, targetByCreatorId.get(text(proposal, "creator_id") ?? "") ?? null, "sdk_game_module_profile_proposals", proposal);
  }
  for (const audit of auditRows) {
    push(targets, targetByCreatorId.get(text(audit, "creator_id") ?? "") ?? null, "sdk_game_module_profile_audit", audit);
  }
  const relatedClientIdsByTarget = new Map<OriginalDataPreservationTarget, Set<string>>(
    originalDataPreservationTargets.map((target) => [target, new Set<string>()]),
  );
  for (const [table, relatedRows] of [
    ["sdk_oauth_grants_safe", grantRows],
    ["sdk_oauth_codes_safe", codeRows],
  ] as const) {
    for (const row of relatedRows) {
      const ownerTargets = targetByOwnerPlayerId.get(text(row, "player_id") ?? "") ?? [];
      const clientId = text(row, "client_id");
      if (ownerTargets.length === 0 || !clientId) {
        throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
      }
      for (const target of ownerTargets) {
        push(targets, target, table, row);
        relatedClientIdsByTarget.get(target)!.add(clientId);
      }
    }
  }
  for (const client of clientRows) {
    const clientId = text(client, "client_id");
    if (!clientId) throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
    let matched = false;
    for (const target of originalDataPreservationTargets) {
      if (relatedClientIdsByTarget.get(target)!.has(clientId)) {
        push(targets, target, "sdk_oauth_clients", client);
        matched = true;
      }
    }
    if (!matched) throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
  }

  const targetSnapshots = originalDataPreservationTargets.map((target) => targets.get(target)!) as OriginalDataPreservationSnapshot["targets"];
  const sourceDatabaseFingerprint = originalDataPreservationFingerprint({
    secret: input.secret,
    scope: "runtime-selected-database",
    value: input.binding.databaseUrl,
  });
  const sourceDeploymentFingerprint = originalDataPreservationFingerprint({
    secret: input.secret,
    scope: "source-deployment",
    value: input.sourceDeploymentIdentity,
  });
  const snapshotFingerprint = originalDataPreservationFingerprint({
    secret: input.secret,
    scope: "repeatable-read-snapshot",
    value: canonicalOriginalDataPreservationJson({
      snapshotId: meta.snapshot_id,
      observedAt,
      sourceMainCommit: input.sourceMainCommit,
      ledger,
      targets: targetSnapshots,
    }),
  });
  return {
    formatVersion: 1,
    environment: "production",
    sourceRef: "main",
    sourceMainCommit: input.sourceMainCommit,
    sourceDeploymentFingerprint,
    sourceDatabaseFingerprint,
    snapshotFingerprint,
    observedAt,
    transaction: { isolationLevel: "repeatable read", readOnly: true },
    ledger,
    targets: targetSnapshots,
  };
}
