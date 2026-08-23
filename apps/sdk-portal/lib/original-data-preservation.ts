import { createHash, createHmac } from "node:crypto";
import type { RuntimeArtifactReader } from "@game-fields/sdk-runtime-artifact";
import { createStoredZip, extractStoredZip } from "./stored-zip.ts";

export const originalDataPreservationTargets = ["moi-lab2", "yabobojpn-lab"] as const;
export type OriginalDataPreservationTarget = typeof originalDataPreservationTargets[number];

export const originalDataPreservationAdminPath =
  "/api/admin/sdk-original-data-preservation";
export const originalDataPreservationInternalPath =
  "/api/internal/operations/original-data-preservation";
export const originalDataPreservationReceiptHeader =
  "X-Game-Fields-A0-Preservation-Receipt";

export const originalDataPreservationOverrideHeaders = [
  "creator-slug",
  "slug",
  "target",
  "target-slug",
  "filename",
  "revision",
  "source-ref",
  "x-creator-slug",
  "x-creator-target",
  "x-target-slug",
  "x-database-url",
  "x-database",
  "x-environment",
  "x-filename",
  "x-migration",
  "x-revision",
  "x-source-ref",
  "x-sql",
  "x-table",
] as const;

export type OriginalDataPreservationCode =
  | "A0_AUTH_REQUIRED"
  | "A0_RECENT_MFA_REQUIRED"
  | "A0_INPUT_INVALID"
  | "A0_ENVIRONMENT_INVALID"
  | "A0_SOURCE_IDENTITY_INVALID"
  | "A0_SCHEMA_PRECONDITION_FAILED"
  | "A0_TARGET_SNAPSHOT_INCONSISTENT"
  | "A0_ARTIFACT_INCOMPLETE"
  | "A0_EXPORT_TOO_LARGE"
  | "A0_ARCHIVE_INVALID"
  | "A0_EXPORT_UNAVAILABLE";

export class OriginalDataPreservationError extends Error {
  readonly code: OriginalDataPreservationCode;

  constructor(code: OriginalDataPreservationCode) {
    super(code);
    this.code = code;
  }
}

type JsonRow = Record<string, unknown>;

export const originalDataPreservationRecordTables = [
  "sdk_creators",
  "sdk_games",
  "sdk_game_package_revisions",
  "sdk_game_channel_history",
  "sdk_app_releases",
  "sdk_release_decisions",
  "sdk_game_module_profile_proposals",
  "sdk_game_module_profile_audit",
  "sdk_oauth_clients",
  "sdk_oauth_codes_safe",
  "sdk_oauth_grants_safe",
] as const;

export type OriginalDataPreservationRecordTable =
  typeof originalDataPreservationRecordTables[number];

export type OriginalDataPreservationTargetSnapshot = {
  target: OriginalDataPreservationTarget;
  records: Record<OriginalDataPreservationRecordTable, JsonRow[]>;
};

export type OriginalDataPreservationLedgerRow = {
  version: number;
  name: string;
  checksum: string;
  applied_at: unknown;
};

export type OriginalDataPreservationSnapshot = {
  formatVersion: 1;
  environment: "production";
  sourceRef: "main";
  sourceMainCommit: string;
  sourceDeploymentFingerprint: string;
  sourceDatabaseFingerprint: string;
  snapshotFingerprint: string;
  observedAt: string;
  transaction: {
    isolationLevel: "repeatable read";
    readOnly: true;
  };
  ledger: OriginalDataPreservationLedgerRow[];
  targets: [
    OriginalDataPreservationTargetSnapshot,
    OriginalDataPreservationTargetSnapshot,
  ];
};

export type OriginalDataPreservationArtifactStatus =
  | "COMPLETE"
  | "ARTIFACT_SOURCE_NOT_LOCATED";

export type OriginalDataPreservationTargetReceipt = {
  target: OriginalDataPreservationTarget;
  lifecycle: "active" | "deleted";
  principalValidity: "BOUND" | "NULL";
  recordCounts: Record<OriginalDataPreservationRecordTable, number>;
  artifactStatus: OriginalDataPreservationArtifactStatus;
  artifactLocatorCount: number;
  artifactPresentCount: number;
  artifactMissingCount: 0;
  artifactUnavailableCount: 0;
  artifactFileCount: number;
};

export type OriginalDataPreservationReceipt = {
  schemaVersion: 1;
  phaseId: "T-131-A0";
  sourceMainCommit: string;
  sourceDeploymentFingerprint: string;
  semanticEnvironment: "production";
  sourceDatabaseFingerprint: string;
  snapshotFingerprint: string;
  observedAt: string;
  observedSchemaVersion: 9;
  migrationLedger: "CANONICAL_001_009_AND_010_ABSENT";
  targets: [
    OriginalDataPreservationTargetReceipt,
    OriginalDataPreservationTargetReceipt,
  ];
  filename: string;
  zipBytes: number;
  zipSha256: string;
  serverArchiveVerification: "PASS";
  credentialScan: "PASS";
  productionWriteCount: 0;
  controlPlaneWriteCount: 0;
};

export type OriginalDataPreservationArchive = {
  archive: Buffer;
  receipt: OriginalDataPreservationReceipt;
};

const sha1Pattern = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const allowedArtifactModes = new Set(["100644"]);
const maximumArtifactLocators = 256;
const maximumArtifactFiles = 8_192;
const maximumArtifactFileBytes = 2 * 1024 * 1024;
const maximumArchivePayloadBytes = 256 * 1024 * 1024;

export const originalDataPreservationSchema9Ledger = Object.freeze([
  { version: 1, name: "001_sdk_registry.sql", checksum: "5456100f4e2bf5cbba4cdf64bc883699ce0a89971e293c08a353803a1e965117" },
  { version: 2, name: "002_sdk_portal_runtime.sql", checksum: "22a80f2062ff27bcadb0be6e940ee6b32a79d171f74865cd043415acb516ce63" },
  { version: 3, name: "003_immutable_packages_and_lifecycle.sql", checksum: "60c88555bb042c28f5196d7c916ac222fb2ab37ef4294e64b32e5d4ddd2507c5" },
  { version: 4, name: "004_app_release_history.sql", checksum: "51fd28e7b1d2452fe96ba850d1dd7089201031230cdf710733085949099a4571" },
  { version: 5, name: "005_release_decisions.sql", checksum: "242ec4c6fa3004dc8c91605960b5cfe1f0241108d00d114e9cc2f4f494363d34" },
  { version: 6, name: "006_cross_environment_package_artifacts.sql", checksum: "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7" },
  { version: 7, name: "007_reconcile_release_decisions.sql", checksum: "242ec4c6fa3004dc8c91605960b5cfe1f0241108d00d114e9cc2f4f494363d34" },
  { version: 8, name: "008_mock_approval_and_authoring_gate.sql", checksum: "e8b31e6debda55d6a70977a5d9c96aa97403983821d52b1ebcd8d1b32b608894" },
  { version: 9, name: "009_module_profile_proposals.sql", checksum: "b7f306bf3d236118d38719722647984119cdb18aec8614cf042fde757f67c723" },
]);

export const originalDataPreservationSchema9AcceptedLegacyEntries = Object.freeze([
  Object.freeze({
    version: 5,
    name: "005_cross_environment_package_artifacts.sql",
    checksum: "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7",
  }),
]);

export const originalDataPreservationCredentialExclusions = Object.freeze([
  { table: "sdk_creators", columns: ["management_token_hash"] },
  { table: "sdk_oauth_codes", columns: ["code_hash", "code_challenge"] },
  { table: "sdk_oauth_grants", columns: ["access_token_hash", "refresh_token_hash"] },
  { table: "runtime", columns: ["database_url", "database_host", "database_user", "database_password", "service_authorization", "site_admin_cookie", "site_admin_mfa_material"] },
]);

const prohibitedRecordColumns = new Set(
  originalDataPreservationCredentialExclusions.flatMap((entry) => entry.columns),
);

function normalizeJson(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeJson(child)]),
    );
  }
  return value;
}

export function canonicalOriginalDataPreservationJson(value: unknown) {
  return `${JSON.stringify(normalizeJson(value), null, 2)}\n`;
}

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function gitBlobSha(value: Uint8Array) {
  const content = Buffer.from(value);
  return createHash("sha1")
    .update(`blob ${content.byteLength}\0`)
    .update(content)
    .digest("hex");
}

export function originalDataPreservationFingerprint(input: {
  secret: string;
  scope: string;
  value: string;
}) {
  if (Buffer.byteLength(input.secret, "utf8") < 32 || !input.scope || !input.value) {
    throw new OriginalDataPreservationError("A0_SOURCE_IDENTITY_INVALID");
  }
  return createHmac("sha256", input.secret)
    .update(`game-fields-t131-a0:v1:production:${input.scope}\0`)
    .update(input.value)
    .digest("hex");
}

export function acceptsOriginalDataPreservationRequest(
  request: Request,
  expectedPath: string,
  expectedMethod: "GET" | "POST",
) {
  const url = new URL(request.url);
  const contentLength = request.headers.get("content-length");
  return request.method === expectedMethod
    && url.pathname === expectedPath
    && url.search === ""
    && (contentLength === null || contentLength === "0")
    && originalDataPreservationOverrideHeaders.every((name) => !request.headers.has(name));
}

export function assertOriginalDataPreservationLedger(
  rows: readonly OriginalDataPreservationLedgerRow[],
) {
  if (rows.length !== 9) {
    throw new OriginalDataPreservationError("A0_SCHEMA_PRECONDITION_FAILED");
  }
  for (let index = 0; index < originalDataPreservationSchema9Ledger.length; index += 1) {
    const expected = originalDataPreservationSchema9Ledger[index]!;
    const row = rows[index];
    if (!row || Number(row.version) !== expected.version) {
      throw new OriginalDataPreservationError("A0_SCHEMA_PRECONDITION_FAILED");
    }
    const isCanonical = row.name === expected.name
      && row.checksum === expected.checksum;
    const isAcceptedLegacy = originalDataPreservationSchema9AcceptedLegacyEntries
      .some((entry) => entry.version === expected.version
        && row.name === entry.name
        && row.checksum === entry.checksum);
    if (!isCanonical && !isAcceptedLegacy) {
      throw new OriginalDataPreservationError("A0_SCHEMA_PRECONDITION_FAILED");
    }
  }
}

function stringValue(row: JsonRow, key: string) {
  return typeof row[key] === "string" ? row[key] as string : null;
}

function nullableStringIsValid(value: unknown) {
  return value === null || typeof value === "string";
}

function assertNoCredentialColumns(snapshot: OriginalDataPreservationSnapshot) {
  for (const target of snapshot.targets) {
    for (const rows of Object.values(target.records)) {
      for (const row of rows) {
        if (Object.keys(row).some((key) => prohibitedRecordColumns.has(key))) {
          throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
        }
      }
    }
  }
}

export function assertOriginalDataPreservationRelationships(
  snapshot: OriginalDataPreservationSnapshot,
) {
  if (
    snapshot.formatVersion !== 1
    || snapshot.environment !== "production"
    || snapshot.sourceRef !== "main"
    || !sha1Pattern.test(snapshot.sourceMainCommit)
    || !sha256Pattern.test(snapshot.sourceDeploymentFingerprint)
    || !sha256Pattern.test(snapshot.sourceDatabaseFingerprint)
    || !sha256Pattern.test(snapshot.snapshotFingerprint)
    || snapshot.transaction.isolationLevel !== "repeatable read"
    || snapshot.transaction.readOnly !== true
    || snapshot.targets.length !== 2
    || snapshot.targets.map(({ target }) => target).join("|") !== originalDataPreservationTargets.join("|")
  ) {
    throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
  }
  assertNoCredentialColumns(snapshot);

  for (const targetSnapshot of snapshot.targets) {
    const { target, records } = targetSnapshot;
    const creator = records.sdk_creators[0];
    if (
      records.sdk_creators.length !== 1
      || !creator
      || stringValue(creator, "slug") !== target
      || !nullableStringIsValid(creator.owner_player_id)
      || (typeof creator.owner_player_id === "string" && creator.owner_player_id.length === 0)
    ) {
      throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
    }
    const creatorId = stringValue(creator, "id");
    if (!creatorId) throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");

    const gameRows = new Map<string, string>();
    const lineages = new Set<string>();
    for (const game of records.sdk_games) {
      const rowId = stringValue(game, "id");
      const gameId = stringValue(game, "game_id");
      if (!rowId || !gameId || stringValue(game, "creator_id") !== creatorId) {
        throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
      }
      gameRows.set(rowId, gameId);
      lineages.add(`${target}/${gameId}`);
    }
    const requiresGameRow = (row: JsonRow, key = "game_id") => {
      const gameRowId = stringValue(row, key);
      return Boolean(gameRowId && gameRows.has(gameRowId));
    };
    if (
      records.sdk_game_package_revisions.some((row) => !requiresGameRow(row))
      || records.sdk_game_channel_history.some((row) => !requiresGameRow(row))
    ) {
      throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
    }
    for (const proposal of records.sdk_game_module_profile_proposals) {
      const gameRowId = stringValue(proposal, "game_row_id");
      if (
        stringValue(proposal, "creator_id") !== creatorId
        || !gameRowId
        || gameRows.get(gameRowId) !== stringValue(proposal, "game_id")
      ) {
        throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
      }
    }
    const proposalIds = new Set(
      records.sdk_game_module_profile_proposals
        .map((row) => stringValue(row, "id"))
        .filter((value): value is string => Boolean(value)),
    );
    for (const audit of records.sdk_game_module_profile_audit) {
      const proposalId = stringValue(audit, "proposal_id");
      if (
        stringValue(audit, "creator_id") !== creatorId
        || !requiresGameRow(audit, "game_row_id")
        || (proposalId !== null && !proposalIds.has(proposalId))
      ) {
        throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
      }
    }
    const releaseIds = new Set<string>();
    for (const release of records.sdk_app_releases) {
      const id = stringValue(release, "id");
      const lineage = stringValue(release, "lineage_id");
      const gameId = stringValue(release, "source_game_id");
      if (
        !id
        || stringValue(release, "source_creator_slug") !== target
        || !gameId
        || lineage !== `${target}/${gameId}`
        || !lineages.has(lineage)
      ) {
        throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
      }
      releaseIds.add(id);
    }
    if (records.sdk_app_releases.some((release) => {
      const restoredFrom = stringValue(release, "restored_from");
      return restoredFrom !== null && !releaseIds.has(restoredFrom);
    })) {
      throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
    }
    for (const decision of records.sdk_release_decisions) {
      const lineage = stringValue(decision, "lineage_id");
      const releaseId = stringValue(decision, "release_id");
      if (!lineage || !lineages.has(lineage) || (releaseId !== null && !releaseIds.has(releaseId))) {
        throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
      }
    }

    const ownerPlayerId = stringValue(creator, "owner_player_id");
    const relatedClientIds = new Set<string>();
    for (const row of [...records.sdk_oauth_codes_safe, ...records.sdk_oauth_grants_safe]) {
      const clientId = stringValue(row, "client_id");
      if (!ownerPlayerId || stringValue(row, "player_id") !== ownerPlayerId || !clientId) {
        throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
      }
      relatedClientIds.add(clientId);
    }
    const archivedClientIds = new Set(
      records.sdk_oauth_clients
        .map((row) => stringValue(row, "client_id"))
        .filter((value): value is string => Boolean(value)),
    );
    if (
      archivedClientIds.size !== records.sdk_oauth_clients.length
      || [...relatedClientIds].some((clientId) => !archivedClientIds.has(clientId))
      || [...archivedClientIds].some((clientId) => !relatedClientIds.has(clientId))
    ) {
      throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
    }
  }
}

type ArtifactLocator = {
  target: OriginalDataPreservationTarget;
  kind: "mock" | "package";
  gameId: string;
  revision: string;
  references: string[];
};

type ArchivedArtifactEntry = {
  sourcePath: string;
  archivePath: string;
  mode: "100644";
  bytes: number;
  blobSha: string;
  contentSha256: string;
};

type ArchivedArtifactLocator = ArtifactLocator & {
  commitSha: string;
  treeSha: string;
  sourcePrefix: string;
  files: ArchivedArtifactEntry[];
};

export type OriginalDataPreservationArtifactManifest = {
  formatVersion: 1;
  target: OriginalDataPreservationTarget;
  status: OriginalDataPreservationArtifactStatus;
  locatorCount: number;
  presentCount: number;
  missingCount: 0;
  unavailableCount: 0;
  fileCount: number;
  locators: ArchivedArtifactLocator[];
};

function addArtifactLocator(
  locators: Map<string, ArtifactLocator>,
  input: Omit<ArtifactLocator, "references"> & { reference: string },
) {
  if (!input.revision) return;
  if (!input.gameId || !sha1Pattern.test(input.revision)) {
    throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
  }
  const key = `${input.target}:${input.kind}:${input.gameId}:${input.revision}`;
  const existing = locators.get(key);
  if (existing) {
    if (!existing.references.includes(input.reference)) existing.references.push(input.reference);
    return;
  }
  locators.set(key, {
    target: input.target,
    kind: input.kind,
    gameId: input.gameId,
    revision: input.revision,
    references: [input.reference],
  });
}

function artifactLocators(snapshot: OriginalDataPreservationSnapshot) {
  const locators = new Map<string, ArtifactLocator>();
  for (const { target, records } of snapshot.targets) {
    const gameIdsByRow = new Map<string, string>();
    for (const game of records.sdk_games) {
      const rowId = stringValue(game, "id")!;
      const gameId = stringValue(game, "game_id")!;
      gameIdsByRow.set(rowId, gameId);
      for (const [kind, field] of [
        ["mock", "mock_revision"],
        ["mock", "mock_approved_revision"],
        ["package", "package_revision"],
        ["package", "development_revision"],
        ["package", "stable_revision"],
      ] as const) {
        addArtifactLocator(locators, {
          target,
          kind,
          gameId,
          revision: stringValue(game, field) ?? "",
          reference: `sdk_games.${field}`,
        });
      }
    }
    for (const revision of records.sdk_game_package_revisions) {
      addArtifactLocator(locators, {
        target,
        kind: "package",
        gameId: gameIdsByRow.get(stringValue(revision, "game_id") ?? "") ?? "",
        revision: stringValue(revision, "revision") ?? "",
        reference: "sdk_game_package_revisions.revision",
      });
      addArtifactLocator(locators, {
        target,
        kind: "mock",
        gameId: gameIdsByRow.get(stringValue(revision, "game_id") ?? "") ?? "",
        revision: stringValue(revision, "prototype_revision") ?? "",
        reference: "sdk_game_package_revisions.prototype_revision",
      });
    }
    for (const history of records.sdk_game_channel_history) {
      addArtifactLocator(locators, {
        target,
        kind: "package",
        gameId: gameIdsByRow.get(stringValue(history, "game_id") ?? "") ?? "",
        revision: stringValue(history, "revision") ?? "",
        reference: "sdk_game_channel_history.revision",
      });
    }
    for (const release of records.sdk_app_releases) {
      const gameId = stringValue(release, "source_game_id") ?? "";
      for (const field of ["revision", "source_revision"] as const) {
        addArtifactLocator(locators, {
          target,
          kind: "package",
          gameId,
          revision: stringValue(release, field) ?? "",
          reference: `sdk_app_releases.${field}`,
        });
      }
    }
  }
  if (locators.size > maximumArtifactLocators) {
    throw new OriginalDataPreservationError("A0_EXPORT_TOO_LARGE");
  }
  return [...locators.values()]
    .map((locator) => ({ ...locator, references: [...locator.references].sort() }))
    .sort((left, right) => (
      `${left.target}:${left.kind}:${left.gameId}:${left.revision}`
        .localeCompare(`${right.target}:${right.kind}:${right.gameId}:${right.revision}`)
    ));
}

function safeArtifactPath(value: string) {
  return value.length > 0
    && value.length <= 500
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

const highConfidenceCredentialPatterns = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  /\b(?:postgres(?:ql)?|redis|rediss):\/\/[^\s:@/]+:[^\s@/]+@/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
] as const;

function assertNoCredentialMaterial(path: string, content: Uint8Array) {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return;
  }
  if (highConfidenceCredentialPatterns.some((pattern) => pattern.test(decoded))) {
    throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
  }
  if (/\.(?:json|ndjson)$/i.test(path)) {
    try {
      const parsed = JSON.parse(decoded) as unknown;
      const visit = (value: unknown): boolean => {
        if (!value || typeof value !== "object") return false;
        if (Array.isArray(value)) return value.some(visit);
        return Object.entries(value as Record<string, unknown>).some(([key, child]) => (
          prohibitedRecordColumns.has(key) || visit(child)
        ));
      };
      if (visit(parsed)) {
        throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
      }
    } catch (error) {
      if (error instanceof OriginalDataPreservationError) throw error;
    }
  }
}

async function collectArtifacts(
  snapshot: OriginalDataPreservationSnapshot,
  reader: Pick<RuntimeArtifactReader, "readCommit" | "readTree" | "readBlob">,
) {
  const locators = artifactLocators(snapshot);
  const files = new Map<string, Buffer>();
  const manifests = new Map<OriginalDataPreservationTarget, OriginalDataPreservationArtifactManifest>();
  const waiting: Array<() => void> = [];
  let activeReads = 0;
  const limitedRead = async <T>(operation: () => Promise<T>) => {
    if (activeReads >= 12) await new Promise<void>((resolve) => waiting.push(resolve));
    activeReads += 1;
    try {
      return await operation();
    } finally {
      activeReads -= 1;
      waiting.shift()?.();
    }
  };
  const commits = new Map<string, Promise<NonNullable<Awaited<ReturnType<typeof reader.readCommit>>>>>();
  const trees = new Map<string, Promise<NonNullable<Awaited<ReturnType<typeof reader.readTree>>>>>();
  const blobs = new Map<string, Promise<Buffer>>();
  const getCommit = (revision: string) => {
    let promise = commits.get(revision);
    if (!promise) {
      promise = limitedRead(async () => {
        const commit = await reader.readCommit(revision);
        if (!commit || commit.commitSha !== revision || !sha1Pattern.test(commit.treeSha)) {
          throw new OriginalDataPreservationError("A0_ARTIFACT_INCOMPLETE");
        }
        return commit;
      });
      commits.set(revision, promise);
    }
    return promise;
  };
  const getTree = (treeSha: string) => {
    let promise = trees.get(treeSha);
    if (!promise) {
      promise = limitedRead(async () => {
        const tree = await reader.readTree(treeSha);
        if (!tree) throw new OriginalDataPreservationError("A0_ARTIFACT_INCOMPLETE");
        return tree;
      });
      trees.set(treeSha, promise);
    }
    return promise;
  };
  const getBlob = (blobSha: string) => {
    let promise = blobs.get(blobSha);
    if (!promise) {
      promise = limitedRead(async () => {
        const bytes = await reader.readBlob(blobSha);
        if (
          bytes === null
          || bytes.byteLength > maximumArtifactFileBytes
          || gitBlobSha(bytes) !== blobSha
        ) {
          throw new OriginalDataPreservationError("A0_ARTIFACT_INCOMPLETE");
        }
        return Buffer.from(bytes);
      });
      blobs.set(blobSha, promise);
    }
    return promise;
  };
  let totalBytes = 0;
  let totalFiles = 0;

  const materialized = await Promise.all(locators.map(async (locator) => {
    try {
      const commit = await getCommit(locator.revision);
      const tree = await getTree(commit.treeSha);
      const sourcePrefix = locator.kind === "mock"
        ? `previews/${locator.target}/${locator.gameId}/mock/`
        : `packages/${locator.target}/${locator.gameId}/bundle/`;
      const matching = tree
        .filter((entry) => entry.type === "blob" && entry.path.startsWith(sourcePrefix))
        .sort((left, right) => left.path.localeCompare(right.path));
      const maximumFilesForLocator = locator.kind === "mock" ? 32 : 128;
      if (matching.length === 0 || matching.length > maximumFilesForLocator) {
        throw new OriginalDataPreservationError("A0_ARTIFACT_INCOMPLETE");
      }
      const foldedPaths = new Set<string>();
      const prepared = matching.map((entry) => {
        const relativePath = entry.path.slice(sourcePrefix.length);
        const foldedPath = relativePath.toLocaleLowerCase("en-US");
        if (
          !safeArtifactPath(relativePath)
          || foldedPaths.has(foldedPath)
          || !sha1Pattern.test(entry.sha)
          || !entry.mode
          || !allowedArtifactModes.has(entry.mode)
          || (entry.bytes !== undefined && (
            !Number.isSafeInteger(entry.bytes)
            || entry.bytes < 0
            || entry.bytes > maximumArtifactFileBytes
          ))
        ) {
          throw new OriginalDataPreservationError("A0_ARTIFACT_INCOMPLETE");
        }
        foldedPaths.add(foldedPath);
        return { entry, relativePath };
      });
      const materializedFiles = await Promise.all(prepared.map(async ({ entry, relativePath }) => {
        const content = await getBlob(entry.sha);
        if (entry.bytes !== undefined && entry.bytes !== content.byteLength) {
          throw new OriginalDataPreservationError("A0_ARTIFACT_INCOMPLETE");
        }
        const archivePath = `git-artifacts/${locator.target}/${locator.revision}/${locator.kind}/${locator.gameId}/${relativePath}`;
        assertNoCredentialMaterial(archivePath, content);
        return {
          content,
          manifest: {
            sourcePath: entry.path,
            archivePath,
            mode: "100644" as const,
            bytes: content.byteLength,
            blobSha: entry.sha,
            contentSha256: sha256(content),
          },
        };
      }));
      return {
        target: locator.target,
        files: materializedFiles,
        manifest: {
          ...locator,
          commitSha: commit.commitSha,
          treeSha: commit.treeSha,
          sourcePrefix,
          files: materializedFiles.map((file) => file.manifest),
        } satisfies ArchivedArtifactLocator,
      };
    } catch (error) {
      if (error instanceof OriginalDataPreservationError) throw error;
      throw new OriginalDataPreservationError("A0_ARTIFACT_INCOMPLETE");
    }
  }));

  for (const target of originalDataPreservationTargets) {
    const targetLocators = materialized.filter((locator) => locator.target === target);
    if (target === "yabobojpn-lab" && targetLocators.length === 0) {
      throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
    }
    const archivedLocators: ArchivedArtifactLocator[] = [];
    for (const locator of targetLocators) {
      try {
        for (const file of locator.files) {
          const { archivePath } = file.manifest;
          if (files.has(archivePath)) {
            throw new OriginalDataPreservationError("A0_ARTIFACT_INCOMPLETE");
          }
          files.set(archivePath, file.content);
          totalBytes += file.content.byteLength;
          totalFiles += 1;
          if (totalFiles > maximumArtifactFiles || totalBytes > maximumArchivePayloadBytes) {
            throw new OriginalDataPreservationError("A0_EXPORT_TOO_LARGE");
          }
        }
        archivedLocators.push(locator.manifest);
      } catch (error) {
        if (error instanceof OriginalDataPreservationError) throw error;
        throw new OriginalDataPreservationError("A0_ARTIFACT_INCOMPLETE");
      }
    }
    const fileCount = archivedLocators.reduce((count, locator) => count + locator.files.length, 0);
    manifests.set(target, {
      formatVersion: 1,
      target,
      status: targetLocators.length === 0 ? "ARTIFACT_SOURCE_NOT_LOCATED" : "COMPLETE",
      locatorCount: targetLocators.length,
      presentCount: targetLocators.length,
      missingCount: 0,
      unavailableCount: 0,
      fileCount,
      locators: archivedLocators,
    });
  }
  return { files, manifests };
}

function targetReceipt(
  snapshot: OriginalDataPreservationTargetSnapshot,
  artifacts: OriginalDataPreservationArtifactManifest,
): OriginalDataPreservationTargetReceipt {
  const creator = snapshot.records.sdk_creators[0]!;
  return {
    target: snapshot.target,
    lifecycle: creator.deleted_at === null ? "active" : "deleted",
    principalValidity: creator.owner_player_id === null ? "NULL" : "BOUND",
    recordCounts: Object.fromEntries(
      originalDataPreservationRecordTables.map((table) => [table, snapshot.records[table].length]),
    ) as Record<OriginalDataPreservationRecordTable, number>,
    artifactStatus: artifacts.status,
    artifactLocatorCount: artifacts.locatorCount,
    artifactPresentCount: artifacts.presentCount,
    artifactMissingCount: 0,
    artifactUnavailableCount: 0,
    artifactFileCount: artifacts.fileCount,
  };
}

function archiveFilename(observedAt: string) {
  const timestamp = observedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  if (!/^\d{8}T\d{6}Z$/.test(timestamp)) {
    throw new OriginalDataPreservationError("A0_TARGET_SNAPSHOT_INCONSISTENT");
  }
  return `Game-Fields-T-131-A0-original-data-${timestamp}.zip`;
}

function receiptShape(value: unknown): value is OriginalDataPreservationReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<OriginalDataPreservationReceipt>;
  return receipt.schemaVersion === 1
    && receipt.phaseId === "T-131-A0"
    && typeof receipt.sourceMainCommit === "string"
    && sha1Pattern.test(receipt.sourceMainCommit)
    && typeof receipt.sourceDeploymentFingerprint === "string"
    && sha256Pattern.test(receipt.sourceDeploymentFingerprint)
    && receipt.semanticEnvironment === "production"
    && typeof receipt.sourceDatabaseFingerprint === "string"
    && sha256Pattern.test(receipt.sourceDatabaseFingerprint)
    && typeof receipt.snapshotFingerprint === "string"
    && sha256Pattern.test(receipt.snapshotFingerprint)
    && typeof receipt.observedAt === "string"
    && receipt.observedSchemaVersion === 9
    && receipt.migrationLedger === "CANONICAL_001_009_AND_010_ABSENT"
    && Array.isArray(receipt.targets)
    && receipt.targets.length === 2
    && receipt.targets.map((target) => target.target).join("|") === originalDataPreservationTargets.join("|")
    && typeof receipt.filename === "string"
    && /^Game-Fields-T-131-A0-original-data-\d{8}T\d{6}Z\.zip$/.test(receipt.filename)
    && Number.isSafeInteger(receipt.zipBytes)
    && Number(receipt.zipBytes) > 0
    && typeof receipt.zipSha256 === "string"
    && sha256Pattern.test(receipt.zipSha256)
    && receipt.serverArchiveVerification === "PASS"
    && receipt.credentialScan === "PASS"
    && receipt.productionWriteCount === 0
    && receipt.controlPlaneWriteCount === 0;
}

export function encodeOriginalDataPreservationReceipt(
  receipt: OriginalDataPreservationReceipt,
) {
  if (!receiptShape(receipt)) {
    throw new OriginalDataPreservationError("A0_ARCHIVE_INVALID");
  }
  return Buffer.from(JSON.stringify(receipt), "utf8").toString("base64url");
}

export function decodeOriginalDataPreservationReceipt(value: string) {
  if (!value || value.length > 16_384) {
    throw new OriginalDataPreservationError("A0_ARCHIVE_INVALID");
  }
  try {
    const receipt = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!receiptShape(receipt)) throw new Error("invalid");
    return receipt;
  } catch {
    throw new OriginalDataPreservationError("A0_ARCHIVE_INVALID");
  }
}

function parseJsonFile<T>(files: Map<string, Buffer>, path: string): T {
  const content = files.get(path);
  if (!content) throw new OriginalDataPreservationError("A0_ARCHIVE_INVALID");
  try {
    return JSON.parse(content.toString("utf8")) as T;
  } catch {
    throw new OriginalDataPreservationError("A0_ARCHIVE_INVALID");
  }
}

export function verifyOriginalDataPreservationArchive(input: {
  archive: Uint8Array;
  expectedSnapshotFingerprint?: string;
}) {
  try {
    const entries = extractStoredZip(input.archive);
    const files = new Map(entries.map((entry) => [entry.name, entry.content]));
    if (files.size !== entries.length) throw new Error("duplicate");
    const checksumsContent = files.get("SHA256SUMS");
    if (!checksumsContent) throw new Error("checksums");
    const checksums = new Map<string, string>();
    for (const line of checksumsContent.toString("utf8").trim().split("\n")) {
      const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
      if (!match || checksums.has(match[2]!)) throw new Error("checksum-line");
      checksums.set(match[2]!, match[1]!);
    }
    if (checksums.size !== files.size - 1 || checksums.has("SHA256SUMS")) {
      throw new Error("checksum-coverage");
    }
    for (const [path, content] of files) {
      if (path === "SHA256SUMS") continue;
      if (checksums.get(path) !== sha256(content)) throw new Error("checksum-mismatch");
      assertNoCredentialMaterial(path, content);
    }

    const manifest = parseJsonFile<{
      formatVersion?: unknown;
      phaseId?: unknown;
      source?: { snapshotFingerprint?: unknown };
      targets?: unknown;
      payloadEntries?: Array<{ path?: unknown; bytes?: unknown; sha256?: unknown }>;
    }>(files, "manifest.json");
    if (
      manifest.formatVersion !== 1
      || manifest.phaseId !== "T-131-A0"
      || typeof manifest.source?.snapshotFingerprint !== "string"
      || !sha256Pattern.test(manifest.source.snapshotFingerprint)
      || (input.expectedSnapshotFingerprint
        && manifest.source.snapshotFingerprint !== input.expectedSnapshotFingerprint)
      || !Array.isArray(manifest.targets)
    ) throw new Error("manifest");

    const ledgerFile = parseJsonFile<{
      observedSchemaVersion?: unknown;
      absentVersions?: unknown;
      applied?: OriginalDataPreservationLedgerRow[];
    }>(files, "db/migration-ledger.json");
    if (
      ledgerFile.observedSchemaVersion !== 9
      || JSON.stringify(ledgerFile.absentVersions) !== "[10]"
      || !Array.isArray(ledgerFile.applied)
    ) throw new Error("ledger");
    assertOriginalDataPreservationLedger(ledgerFile.applied);

    const targetSnapshots = originalDataPreservationTargets.map((target) => ({
      target,
      records: Object.fromEntries(originalDataPreservationRecordTables.map((table) => [
        table,
        parseJsonFile<JsonRow[]>(files, `db/${target}/${table}.json`),
      ])) as Record<OriginalDataPreservationRecordTable, JsonRow[]>,
    })) as OriginalDataPreservationSnapshot["targets"];
    const source = parseJsonFile<{
      sourceRef: "main";
      sourceMainCommit: string;
      sourceDeploymentFingerprint: string;
      sourceDatabaseFingerprint: string;
      snapshotFingerprint: string;
      observedAt: string;
      transaction: OriginalDataPreservationSnapshot["transaction"];
    }>(files, "db/source-observation.json");
    assertOriginalDataPreservationRelationships({
      formatVersion: 1,
      environment: "production",
      ...source,
      ledger: ledgerFile.applied,
      targets: targetSnapshots,
    });

    for (const target of originalDataPreservationTargets) {
      const artifactManifest = parseJsonFile<OriginalDataPreservationArtifactManifest>(
        files,
        `git-artifacts/${target}/manifest.json`,
      );
      if (
        artifactManifest.formatVersion !== 1
        || artifactManifest.target !== target
        || artifactManifest.locatorCount !== artifactManifest.locators.length
        || artifactManifest.presentCount !== artifactManifest.locators.length
        || artifactManifest.missingCount !== 0
        || artifactManifest.unavailableCount !== 0
        || (target === "moi-lab2" && artifactManifest.locatorCount === 0
          ? artifactManifest.status !== "ARTIFACT_SOURCE_NOT_LOCATED"
          : artifactManifest.status !== "COMPLETE")
        || (target === "yabobojpn-lab" && artifactManifest.locatorCount === 0)
      ) throw new Error("artifact-manifest");
      let fileCount = 0;
      for (const locator of artifactManifest.locators) {
        if (
          locator.target !== target
          || locator.commitSha !== locator.revision
          || !sha1Pattern.test(locator.treeSha)
        ) throw new Error("artifact-locator");
        for (const entry of locator.files) {
          const content = files.get(entry.archivePath);
          if (
            !content
            || content.byteLength !== entry.bytes
            || sha256(content) !== entry.contentSha256
            || gitBlobSha(content) !== entry.blobSha
            || entry.mode !== "100644"
          ) throw new Error("artifact-file");
          fileCount += 1;
        }
      }
      if (fileCount !== artifactManifest.fileCount) throw new Error("artifact-count");
    }

    const payloadEntries = manifest.payloadEntries ?? [];
    const expectedPayloads = [...files.keys()].filter((path) => (
      path !== "manifest.json" && path !== "SHA256SUMS"
    ));
    if (payloadEntries.length !== expectedPayloads.length) throw new Error("payload-count");
    for (const entry of payloadEntries) {
      if (
        typeof entry.path !== "string"
        || typeof entry.bytes !== "number"
        || typeof entry.sha256 !== "string"
      ) throw new Error("payload-shape");
      const content = files.get(entry.path);
      if (!content || content.byteLength !== entry.bytes || sha256(content) !== entry.sha256) {
        throw new Error("payload-digest");
      }
    }
    return manifest;
  } catch (error) {
    if (error instanceof OriginalDataPreservationError) throw error;
    throw new OriginalDataPreservationError("A0_ARCHIVE_INVALID");
  }
}

export async function buildOriginalDataPreservationArchive(input: {
  snapshot: OriginalDataPreservationSnapshot;
  reader: Pick<RuntimeArtifactReader, "readCommit" | "readTree" | "readBlob">;
}): Promise<OriginalDataPreservationArchive> {
  assertOriginalDataPreservationLedger(input.snapshot.ledger);
  assertOriginalDataPreservationRelationships(input.snapshot);
  const artifacts = await collectArtifacts(input.snapshot, input.reader);
  const payloadFiles = new Map<string, Buffer>();
  payloadFiles.set("README.md", Buffer.from(
    `# Game Fields T-131-A0 original-data preservation\n\n`
      + `This confidential archive preserves the current runtime-selected production source for exactly moi-lab2 and yabobojpn-lab from one schema-9 REPEATABLE READ / READ ONLY snapshot.\n\n`
      + `It is not a release, owner binding, recovery write, migration, public artifact, or authorization credential. Do not upload it to Git, Library, checkpoint, chat, email, Slack, Blob, or another general cloud service.\n\n`
      + `Credential-equivalent fields are omitted. Verify SHA256SUMS and manifest.json before use, then place the ZIP inside an AES-256 encrypted container with filename/header encryption and retain two user-controlled offline copies.\n`,
    "utf8",
  ));
  payloadFiles.set("db/source-observation.json", Buffer.from(
    canonicalOriginalDataPreservationJson({
      sourceRef: input.snapshot.sourceRef,
      sourceMainCommit: input.snapshot.sourceMainCommit,
      sourceDeploymentFingerprint: input.snapshot.sourceDeploymentFingerprint,
      sourceDatabaseFingerprint: input.snapshot.sourceDatabaseFingerprint,
      snapshotFingerprint: input.snapshot.snapshotFingerprint,
      observedAt: input.snapshot.observedAt,
      transaction: input.snapshot.transaction,
    }),
    "utf8",
  ));
  payloadFiles.set("db/migration-ledger.json", Buffer.from(
    canonicalOriginalDataPreservationJson({
      observedSchemaVersion: 9,
      absentVersions: [10],
      applied: input.snapshot.ledger,
    }),
    "utf8",
  ));
  for (const targetSnapshot of input.snapshot.targets) {
    for (const table of originalDataPreservationRecordTables) {
      payloadFiles.set(
        `db/${targetSnapshot.target}/${table}.json`,
        Buffer.from(canonicalOriginalDataPreservationJson(targetSnapshot.records[table]), "utf8"),
      );
    }
    const artifactManifest = artifacts.manifests.get(targetSnapshot.target)!;
    payloadFiles.set(
      `git-artifacts/${targetSnapshot.target}/manifest.json`,
      Buffer.from(canonicalOriginalDataPreservationJson(artifactManifest), "utf8"),
    );
  }
  for (const [path, content] of artifacts.files) payloadFiles.set(path, content);
  for (const [path, content] of payloadFiles) assertNoCredentialMaterial(path, content);
  const payloadBytes = [...payloadFiles.values()].reduce((total, content) => total + content.byteLength, 0);
  if (payloadBytes > maximumArchivePayloadBytes) {
    throw new OriginalDataPreservationError("A0_EXPORT_TOO_LARGE");
  }

  const targetReceipts = input.snapshot.targets.map((targetSnapshot) => targetReceipt(
    targetSnapshot,
    artifacts.manifests.get(targetSnapshot.target)!,
  )) as OriginalDataPreservationReceipt["targets"];
  const payloadEntries = [...payloadFiles]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, content]) => ({ path, bytes: content.byteLength, sha256: sha256(content) }));
  const manifest = {
    formatVersion: 1,
    phaseId: "T-131-A0",
    preservationScope: "EXACT_TWO_TARGETS_ONE_SCHEMA9_SNAPSHOT",
    source: {
      environment: "production",
      sourceRef: "main",
      sourceMainCommit: input.snapshot.sourceMainCommit,
      sourceDeploymentFingerprint: input.snapshot.sourceDeploymentFingerprint,
      sourceDatabaseFingerprint: input.snapshot.sourceDatabaseFingerprint,
      snapshotFingerprint: input.snapshot.snapshotFingerprint,
      observedAt: input.snapshot.observedAt,
      observedSchemaVersion: 9,
      migrationLedger: "CANONICAL_001_009_AND_010_ABSENT",
      transactionIsolation: "repeatable read",
      transactionReadOnly: true,
    },
    targets: targetReceipts,
    credentialExclusions: originalDataPreservationCredentialExclusions,
    payloadEntries,
    checksumContract: "SHA256SUMS covers every archive entry except SHA256SUMS itself; the safe receipt SHA-256 covers the complete ZIP.",
  } as const;
  const manifestContent = Buffer.from(canonicalOriginalDataPreservationJson(manifest), "utf8");
  assertNoCredentialMaterial("manifest.json", manifestContent);
  payloadFiles.set("manifest.json", manifestContent);
  const checksums = Buffer.from(
    `${[...payloadFiles]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, content]) => `${sha256(content)}  ${path}`)
      .join("\n")}\n`,
    "utf8",
  );
  payloadFiles.set("SHA256SUMS", checksums);
  const archive = createStoredZip(
    [...payloadFiles]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, content]) => ({ name, content })),
  );
  verifyOriginalDataPreservationArchive({
    archive,
    expectedSnapshotFingerprint: input.snapshot.snapshotFingerprint,
  });
  const receipt: OriginalDataPreservationReceipt = {
    schemaVersion: 1,
    phaseId: "T-131-A0",
    sourceMainCommit: input.snapshot.sourceMainCommit,
    sourceDeploymentFingerprint: input.snapshot.sourceDeploymentFingerprint,
    semanticEnvironment: "production",
    sourceDatabaseFingerprint: input.snapshot.sourceDatabaseFingerprint,
    snapshotFingerprint: input.snapshot.snapshotFingerprint,
    observedAt: input.snapshot.observedAt,
    observedSchemaVersion: 9,
    migrationLedger: "CANONICAL_001_009_AND_010_ABSENT",
    targets: targetReceipts,
    filename: archiveFilename(input.snapshot.observedAt),
    zipBytes: archive.byteLength,
    zipSha256: sha256(archive),
    serverArchiveVerification: "PASS",
    credentialScan: "PASS",
    productionWriteCount: 0,
    controlPlaneWriteCount: 0,
  };
  return { archive, receipt };
}
