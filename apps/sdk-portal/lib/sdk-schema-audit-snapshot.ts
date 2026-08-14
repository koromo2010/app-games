import { createHash } from "node:crypto";
import { runtimeManifestSha256 } from "@game-fields/sdk-runtime-artifact";
import { SDK_SCHEMA_VERSION, sdkSql } from "./sdk-postgres.ts";

type Availability = "absent" | "partial" | "complete";

export type SdkAuditGameRow = {
  creatorSlug: string;
  gameId: string;
  publicGameId: string | null;
  status: string | null;
  deletedAt: string | null;
  packageRevision: string | null;
  packageRootSha256: string | null;
  packageBundleSha256: string | null;
  packageAppSetSha256: string | null;
  manifest: unknown | null;
  sdkPackageVersion: string | null;
  sdkContractVersion: number | null;
  stableRevision: string | null;
  stableRootSha256: string | null;
  stableBundleSha256: string | null;
  stableAppSetSha256: string | null;
  stableManifest: unknown | null;
};

export type SdkAuditReleaseRow = {
  id: string;
  lineageId: string;
  publicGameId: string;
  sourceCreatorSlug: string;
  sourceGameId: string;
  revision: string | null;
  sourceRevision: string | null;
  packageRootSha256: string | null;
  serverBundleSha256: string | null;
  appSetSourceSha256: string | null;
  manifest: unknown | null;
  modulePolicy: unknown | null;
  sourceEnvironment: string | null;
  releaseKind: string | null;
  restoredFrom: string | null;
  releasedAt: string | null;
  decisionId: string | null;
  decisionAction: string | null;
  decisionRevision: string | null;
  decisionPackageRootSha256: string | null;
  decisionSourceEnvironment: string | null;
  decisionTargetEnvironment: string | null;
  decisionAt: string | null;
};

export type SdkSchemaAuditInput = {
  schemaVersion: number;
  deploymentEnvironment: "production" | "development" | "test";
  observedAt: string;
  games: SdkAuditGameRow[];
  currentReleases: SdkAuditReleaseRow[];
};

export type SdkSchemaAuditDependencies = {
  sql?: ReturnType<typeof sdkSql>;
  clock?: () => Date | string;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function canonicalSdkAuditDigest(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function manifestVersion(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const version = (value as { sdkVersion?: unknown }).sdkVersion;
  return Number.isSafeInteger(version) ? Number(version) : null;
}

function manifestSha256(value: unknown | null) {
  return value === null ? null : runtimeManifestSha256(value);
}

function availability(values: readonly unknown[]): Availability {
  const count = values.filter((value) => value !== null && value !== undefined).length;
  return count === 0 ? "absent" : count === values.length ? "complete" : "partial";
}

function sortedUnique(values: string[]) {
  return [...new Set(values)].sort();
}

function duplicateKeys(values: Array<string | null>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value).sort();
}

function expectedGameStatus(game: {
  tombstone: boolean;
  candidate: { availability: Availability };
  stable: { availability: Availability };
}) {
  if (game.tombstone) return "deleted";
  if (game.stable.availability !== "absent") return "stable";
  if (game.candidate.availability !== "absent") return "submitted";
  return "draft";
}

export function createSdkSchemaAuditSnapshot(input: SdkSchemaAuditInput) {
  if (input.schemaVersion !== SDK_SCHEMA_VERSION) {
    throw new Error(`SDK_SCHEMA_AUDIT_VERSION_MISMATCH:${input.schemaVersion}`);
  }
  const games = input.games.map((game) => {
    const lineageId = `${game.creatorSlug}/${game.gameId}`;
    const candidateValues = [
      game.packageRevision,
      game.packageRootSha256,
      game.packageBundleSha256,
      game.packageAppSetSha256,
      game.manifest,
      game.sdkPackageVersion,
      game.sdkContractVersion,
    ];
    const stableValues = [
      game.stableRevision,
      game.stableRootSha256,
      game.stableBundleSha256,
      game.stableAppSetSha256,
      game.stableManifest,
    ];
    const candidate = {
      availability: availability(candidateValues),
      revision: game.packageRevision,
      packageRootSha256: game.packageRootSha256,
      serverBundleSha256: game.packageBundleSha256,
      appSetSourceSha256: game.packageAppSetSha256,
      manifest: game.manifest,
      manifestVersion: manifestVersion(game.manifest),
      manifestSha256: manifestSha256(game.manifest),
      sdkPackageVersion: game.sdkPackageVersion,
      sdkContractVersion: game.sdkContractVersion,
    };
    return {
      lineageId,
      gameId: game.gameId,
      publicGameId: game.publicGameId,
      status: game.status,
      statusAvailability: game.status === null ? "absent" as const : "complete" as const,
      tombstone: game.deletedAt !== null,
      candidate,
      package: candidate,
      stable: {
        availability: availability(stableValues),
        revision: game.stableRevision,
        sourceRevision: null,
        sourceRevisionAvailability: "unavailable:schema-9" as const,
        packageRootSha256: game.stableRootSha256,
        serverBundleSha256: game.stableBundleSha256,
        appSetSourceSha256: game.stableAppSetSha256,
        manifest: game.stableManifest,
        manifestVersion: manifestVersion(game.stableManifest),
        manifestSha256: manifestSha256(game.stableManifest),
      },
    };
  }).sort((left, right) => left.lineageId.localeCompare(right.lineageId));

  const currentReleases = input.currentReleases.map((release) => {
    const currentValues = [
      release.revision,
      release.sourceRevision,
      release.packageRootSha256,
      release.serverBundleSha256,
      release.appSetSourceSha256,
      release.manifest,
      release.modulePolicy,
      release.sourceEnvironment,
      release.releaseKind,
      release.releasedAt,
    ];
    const decisionValues = [
      release.decisionId,
      release.decisionAction,
      release.decisionRevision,
      release.decisionPackageRootSha256,
      release.decisionSourceEnvironment,
      release.decisionTargetEnvironment,
      release.decisionAt,
    ];
    const latestDecision = {
      id: release.decisionId,
      availability: availability(decisionValues),
      action: release.decisionAction,
      revision: release.decisionRevision,
      packageRootSha256: release.decisionPackageRootSha256,
      sourceEnvironment: release.decisionSourceEnvironment,
      targetEnvironment: release.decisionTargetEnvironment,
      decidedAt: release.decisionAt,
    };
    return {
      id: release.id,
      lineageId: release.lineageId,
      publicGameId: release.publicGameId,
      sourceCreatorSlug: release.sourceCreatorSlug,
      sourceGameId: release.sourceGameId,
      availability: availability(currentValues),
      revision: release.revision,
      sourceRevision: release.sourceRevision,
      packageRootSha256: release.packageRootSha256,
      serverBundleSha256: release.serverBundleSha256,
      appSetSourceSha256: release.appSetSourceSha256,
      manifest: release.manifest,
      manifestVersion: manifestVersion(release.manifest),
      manifestSha256: manifestSha256(release.manifest),
      modulePolicy: release.modulePolicy,
      sourceEnvironment: release.sourceEnvironment,
      kind: release.releaseKind,
      releaseKind: release.releaseKind,
      restoredFrom: release.restoredFrom,
      releasedAt: release.releasedAt,
      latestDecision,
      decision: {
        action: latestDecision.action,
        revision: latestDecision.revision,
        packageRootSha256: latestDecision.packageRootSha256,
        sourceEnvironment: latestDecision.sourceEnvironment,
        targetEnvironment: latestDecision.targetEnvironment,
        decidedAt: latestDecision.decidedAt,
      },
    };
  }).sort((left, right) => `${left.lineageId}:${left.id}`.localeCompare(`${right.lineageId}:${right.id}`));

  const gameByLineage = new Map(games.map((game) => [game.lineageId, game]));
  const releaseLineages = new Set(currentReleases.map((release) => release.lineageId));
  const currentByLineage = new Map(currentReleases.map((release) => [release.lineageId, release]));
  const anomalies = {
    stableAbsent: sortedUnique(games.filter((game) => game.stable.availability === "absent").map((game) => game.lineageId)),
    partialStable: sortedUnique(games.filter((game) => game.stable.availability === "partial").map((game) => game.lineageId)),
    currentAbsent: sortedUnique(games.filter((game) => !releaseLineages.has(game.lineageId)).map((game) => game.lineageId)),
    partialCurrent: sortedUnique(currentReleases.filter((release) => release.availability === "partial").map((release) => release.lineageId)),
    stableWithoutCurrent: sortedUnique(games.filter((game) => game.stable.availability !== "absent" && !releaseLineages.has(game.lineageId)).map((game) => game.lineageId)),
    currentWithoutStable: sortedUnique(currentReleases.filter((release) => gameByLineage.get(release.lineageId)?.stable.availability === "absent").map((release) => release.lineageId)),
    orphanCurrentRelease: sortedUnique(currentReleases.filter((release) => !gameByLineage.has(release.lineageId)).map((release) => release.lineageId)),
    tombstonedCurrentRelease: sortedUnique(currentReleases.filter((release) => gameByLineage.get(release.lineageId)?.tombstone).map((release) => release.lineageId)),
    deletedCurrentRelease: sortedUnique(currentReleases.filter((release) => gameByLineage.get(release.lineageId)?.tombstone).map((release) => release.lineageId)),
    multipleGamesByLineage: duplicateKeys(games.map((game) => game.lineageId)),
    multipleGamesByPublicGameId: duplicateKeys(games.map((game) => game.publicGameId)),
    multipleCurrentByLineage: duplicateKeys(currentReleases.map((release) => release.lineageId)),
    multipleCurrentByPublicGameId: duplicateKeys(currentReleases.map((release) => release.publicGameId)),
    gameStatusMissing: sortedUnique(games.filter((game) => game.statusAvailability === "absent").map((game) => game.lineageId)),
    gameStatusMismatch: sortedUnique(games.filter((game) => game.status !== null && game.status !== expectedGameStatus(game)).map((game) => game.lineageId)),
    decisionMissing: sortedUnique(currentReleases.filter((release) => release.latestDecision.availability === "absent").map((release) => release.lineageId)),
    decisionPartial: sortedUnique(currentReleases.filter((release) => release.latestDecision.availability === "partial").map((release) => release.lineageId)),
    decisionMismatch: sortedUnique(currentReleases.filter((release) => release.latestDecision.availability !== "absent" && (
      release.latestDecision.revision !== release.revision
      || release.latestDecision.packageRootSha256 !== release.packageRootSha256
      || release.latestDecision.sourceEnvironment !== release.sourceEnvironment
      || release.latestDecision.targetEnvironment !== input.deploymentEnvironment
    )).map((release) => release.lineageId)),
    stableManifestHashMissing: sortedUnique(games.filter((game) => game.stable.availability !== "absent" && game.stable.manifestSha256 === null).map((game) => game.lineageId)),
    currentManifestHashMissing: sortedUnique(currentReleases.filter((release) => release.availability !== "absent" && release.manifestSha256 === null).map((release) => release.lineageId)),
    stableCurrentRevisionMismatch: sortedUnique(games.filter((game) => {
      const current = currentByLineage.get(game.lineageId);
      return game.stable.revision !== null && current?.revision !== null && current?.revision !== undefined && game.stable.revision !== current.revision;
    }).map((game) => game.lineageId)),
    stableCurrentManifestMismatch: sortedUnique(games.filter((game) => {
      const current = currentByLineage.get(game.lineageId);
      return game.stable.manifestSha256 !== null && current?.manifestSha256 !== null && current?.manifestSha256 !== undefined && game.stable.manifestSha256 !== current.manifestSha256;
    }).map((game) => game.lineageId)),
    stableSourceRevisionUnavailable: sortedUnique(games.filter((game) => game.stable.availability !== "absent").map((game) => game.lineageId)),
  };
  const environment = {
    deployment: input.deploymentEnvironment,
    database: null,
    databaseAvailability: "unavailable:schema-9",
  } as const;
  const integrity = { schemaVersion: input.schemaVersion, environment, games, currentReleases, anomalies };
  return {
    schemaVersion: input.schemaVersion,
    environment,
    observedAt: input.observedAt,
    games,
    currentReleases,
    anomalies,
    stableDigest: canonicalSdkAuditDigest(games.map((game) => ({ lineageId: game.lineageId, status: game.status, statusAvailability: game.statusAvailability, tombstone: game.tombstone, stable: game.stable }))),
    currentDigest: canonicalSdkAuditDigest(currentReleases),
    integrityDigest: canonicalSdkAuditDigest(integrity),
  };
}

export async function loadSdkSchemaAuditSnapshot(
  deploymentEnvironment: SdkSchemaAuditInput["deploymentEnvironment"],
  dependencies: SdkSchemaAuditDependencies = {},
) {
  const sql = dependencies.sql ?? sdkSql();
  const [schemaRows, gameRows, releaseRows] = await sql.transaction((tx) => [
    tx`SELECT COALESCE(MAX(version), 0)::INTEGER AS version FROM sdk_schema_migrations`,
    tx`
      SELECT c.slug AS "creatorSlug", g.game_id AS "gameId",
             g.public_game_id AS "publicGameId", g.status, g.deleted_at AS "deletedAt",
             g.package_revision AS "packageRevision",
             g.package_root_sha256 AS "packageRootSha256",
             g.package_bundle_sha256 AS "packageBundleSha256",
             g.package_app_set_sha256 AS "packageAppSetSha256",
             g.manifest, g.sdk_package_version AS "sdkPackageVersion",
             g.sdk_contract_version AS "sdkContractVersion",
             g.stable_revision AS "stableRevision",
             g.stable_root_sha256 AS "stableRootSha256",
             g.stable_bundle_sha256 AS "stableBundleSha256",
             g.stable_app_set_sha256 AS "stableAppSetSha256",
             g.stable_manifest AS "stableManifest"
      FROM sdk_games g JOIN sdk_creators c ON c.id = g.creator_id
      ORDER BY c.slug, g.game_id
    `,
    tx`
      SELECT r.id, r.lineage_id AS "lineageId", r.public_game_id AS "publicGameId",
             r.source_creator_slug AS "sourceCreatorSlug", r.source_game_id AS "sourceGameId",
             r.revision, r.source_revision AS "sourceRevision",
             r.package_root_sha256 AS "packageRootSha256",
             r.server_bundle_sha256 AS "serverBundleSha256",
             r.app_set_source_sha256 AS "appSetSourceSha256", r.manifest,
             r.module_policy AS "modulePolicy", r.source_environment AS "sourceEnvironment",
             r.release_kind AS "releaseKind", r.restored_from AS "restoredFrom",
             r.released_at AS "releasedAt", d.id AS "decisionId",
             d.action AS "decisionAction", d.revision AS "decisionRevision",
             d.package_root_sha256 AS "decisionPackageRootSha256",
             d.source_environment AS "decisionSourceEnvironment",
             d.target_environment AS "decisionTargetEnvironment", d.decided_at AS "decisionAt"
      FROM sdk_app_releases r
      LEFT JOIN LATERAL (
        SELECT id, action, revision, package_root_sha256, source_environment,
               target_environment, decided_at
        FROM sdk_release_decisions
        WHERE release_id = r.id
        ORDER BY decided_at DESC, id DESC
        LIMIT 1
      ) d ON TRUE
      WHERE r.is_current
      ORDER BY r.lineage_id, r.id
    `,
  ], { isolationLevel: "RepeatableRead", readOnly: true });
  const schemaVersion = Number((schemaRows as Array<{ version?: unknown }>)[0]?.version ?? 0);
  const observed = dependencies.clock?.() ?? new Date();
  return createSdkSchemaAuditSnapshot({
    schemaVersion,
    deploymentEnvironment,
    observedAt: typeof observed === "string" ? observed : observed.toISOString(),
    games: gameRows as unknown as SdkAuditGameRow[],
    currentReleases: releaseRows as unknown as SdkAuditReleaseRow[],
  });
}
