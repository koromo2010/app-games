import { createHash } from "node:crypto";
import { extractStoredZip, type StoredZipEntry } from "./stored-zip.ts";
import {
  developmentPrivateWorkspaceImportEnvironment,
  developmentPrivateWorkspaceImportIntent,
  developmentPrivateWorkspaceImportSchemaVersion,
  developmentPrivateWorkspaceImportTargetSpecs,
  type DevelopmentPrivateWorkspaceImportTarget,
  type DevelopmentPrivateWorkspaceImportTargetSpec,
} from "./development-private-workspace-import-public-contract.ts";

export {
  developmentPrivateWorkspaceImportEnvironment,
  developmentPrivateWorkspaceImportIntent,
  developmentPrivateWorkspaceImportSchemaVersion,
  developmentPrivateWorkspaceImportTargetSpecs,
  isDevelopmentPrivateWorkspaceImportTarget,
  type DevelopmentPrivateWorkspaceImportTarget,
  type DevelopmentPrivateWorkspaceImportTargetSpec,
} from "./development-private-workspace-import-public-contract.ts";

const t131A4Parent = "98dec9adf87d3876998275b8a70326e8a8214419";
const t131A4A0Bytes = 14_375_278;
const t131A4A0Sha256 = "0919a38bec7dc408f69b1ace799e7901a8ea419bf33fdb8b22bc47e0ac13a9f5";
const sha1Pattern = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const gameIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const maximumArchiveBytes = 1_048_576;
const maximumEntryBytes = 2_097_152;
const maximumPayloadBytes = 8_388_608;
const maximumEntries = 4_096;

export type DevelopmentPrivateWorkspaceImportFile = {
  path: string;
  bytes: number;
  sha256: string;
  content: Buffer;
};

export type DevelopmentPrivateWorkspaceImportGame = {
  gameId: string;
  reconstructionMode: "ARTIFACT_HEAD" | "DEFINITION_BACKED_SEMANTIC_REBUILD";
  originalRevision: string | null;
  workspaceDocument: Record<string, unknown>;
  workspaceDocumentSha256: string;
  provenanceSha256: string;
  runtimeFilesSha256: string;
  runtimeFiles: DevelopmentPrivateWorkspaceImportFile[];
};

export type ValidatedDevelopmentPrivateWorkspaceBundle = {
  target: DevelopmentPrivateWorkspaceImportTarget;
  environment: typeof developmentPrivateWorkspaceImportEnvironment;
  schemaVersion: 1;
  bundleBytes: number;
  bundleSha256: string;
  gameCount: number;
  gameIdentitySetSha256: string;
  perGameIdentitySha256: string;
  contentSetSha256: string;
  workspaceManifestSha256: string;
  perGameLedgerSha256: string;
  entryCount: number;
  runtimeFileCount: number;
  runtimeBytes: number;
  creatorRowId: string;
  workspaceManifest: Record<string, unknown>;
  games: DevelopmentPrivateWorkspaceImportGame[];
};

export type DevelopmentPrivateWorkspaceImportBeforeState = {
  targetCreatorRowId: string;
  targetCreatorRows: number;
  targetDeletedCreatorRows: number;
  targetCreatorOwnerRows: number;
  targetGameRows: number;
  targetDeletedGameRows: number;
  targetActiveGameRows: number;
  targetReleaseRows: number;
  targetCurrentReleaseRows: number;
  targetWorkspaceRows: number;
  targetWorkspaceGameRows: number;
  targetWorkspaceFileRows: number;
  sourceStateToken: string;
  publicStateToken: string;
  unrelatedPrivateStateToken: string;
};

export type DevelopmentPrivateWorkspaceImportReadBack = {
  targetWorkspaceRows: 1;
  targetWorkspaceGameRows: number;
  targetWorkspaceFileRows: number;
  bundleSha256: string;
  gameIdentitySetSha256: string;
  perGameIdentitySha256: string;
  contentSetSha256: string;
  sourceStateToken: string;
  publicStateToken: string;
  unrelatedPrivateStateToken: string;
  ownerBindingRows: 0;
  grantRows: 0;
  releaseRows: 0;
  publicationRows: 0;
  aliasRows: 0;
  roomRows: 0;
};

export type DevelopmentPrivateWorkspaceImportPlan = {
  schemaVersion: 1;
  environment: "development";
  target: DevelopmentPrivateWorkspaceImportTarget;
  phase: "plan";
  writesPerformed: 0;
  bundle: {
    bytes: number;
    sha256: string;
    schemaVersion: 1;
    gameCount: number;
    gameIdentitySetSha256: string;
    perGameIdentitySha256: string;
    contentSetSha256: string;
  };
  intendedMutations: {
    privateWorkspaceRows: 1;
    privateGameRows: number;
    privateFileRows: number;
    visibility: "private-quarantined";
    ownerBinding: "unbound";
    grants: 0;
    releases: 0;
    publications: 0;
    aliases: 0;
    rooms: 0;
  };
  beforeStateSha256: string;
  planReceipt: string;
};

export type DevelopmentPrivateWorkspaceImportTerminalReceipt = {
  schemaVersion: 1;
  environment: "development";
  target: DevelopmentPrivateWorkspaceImportTarget;
  phase: "execute";
  operationId: string;
  state: "completed";
  visibility: "private-quarantined";
  ownerBinding: "unbound";
  logicalWrites: 0 | 1;
  replayed: boolean;
  bundle: DevelopmentPrivateWorkspaceImportPlan["bundle"];
  imported: {
    workspaceRows: 1;
    gameRows: number;
    fileRows: number;
  };
  nonEffects: {
    unrelatedTarget: "byte-for-byte-unchanged";
    sourceWorkspace: "row-for-row-unchanged";
    grants: 0;
    releases: 0;
    publications: 0;
    aliases: 0;
    rooms: 0;
  };
  readBackSha256: string;
  terminalReceipt: string;
};

export type DevelopmentPrivateWorkspaceImportStatus = {
  schemaVersion: 1;
  environment: "development";
  target: DevelopmentPrivateWorkspaceImportTarget;
  phase: "status";
  operationId: string;
  state: "not-found" | "completed";
  acceptance: null | {
    workspaceId: string;
    workspaceRows: 1;
    gameRows: number;
    fileRows: number;
    bundleBytes: number;
    bundleSha256: string;
    gameIdentitySetSha256: string;
    perGameIdentitySha256: string;
    contentSetSha256: string;
    visibility: "private-quarantined";
    private: true;
    quarantined: true;
    ownerBinding: "unbound";
    ownerBindingRows: 0;
    grants: 0;
    releases: 0;
    publications: 0;
    aliases: 0;
    rooms: 0;
    statusReceipt: string;
  };
};

export type DevelopmentPrivateWorkspaceImportFaultPoint =
  | "before-ledger"
  | "after-ledger"
  | "after-workspace"
  | "after-games"
  | "after-files"
  | "before-terminal";

export type CompletedDevelopmentPrivateWorkspaceImport = {
  target: DevelopmentPrivateWorkspaceImportTarget;
  operationId: string;
  planReceipt: string;
  bundleSha256: string;
  readBack: DevelopmentPrivateWorkspaceImportReadBack;
};

export type DevelopmentPrivateWorkspaceImportAdapter = {
  readBeforeState(target: DevelopmentPrivateWorkspaceImportTarget): Promise<DevelopmentPrivateWorkspaceImportBeforeState>;
  readCompletedOperation(operationId: string): Promise<CompletedDevelopmentPrivateWorkspaceImport | null>;
  importAtomic(input: {
    bundle: ValidatedDevelopmentPrivateWorkspaceBundle;
    beforeState: DevelopmentPrivateWorkspaceImportBeforeState;
    beforeStateSha256: string;
    operationId: string;
    planReceipt: string;
    terminalReceipt: string;
    readBackSha256: string;
    expectedReadBack: DevelopmentPrivateWorkspaceImportReadBack;
    faultAt?: DevelopmentPrivateWorkspaceImportFaultPoint;
  }): Promise<{ replayed: boolean; readBack: DevelopmentPrivateWorkspaceImportReadBack }>;
};

export class DevelopmentPrivateWorkspaceImportError extends Error {
  readonly code:
    | "DEVELOPMENT_PRIVATE_IMPORT_INPUT_INVALID"
    | "DEVELOPMENT_PRIVATE_IMPORT_TARGET_INVALID"
    | "DEVELOPMENT_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH"
    | "DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_INVALID"
    | "DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_SPECIAL_ENTRY"
    | "DEVELOPMENT_PRIVATE_IMPORT_LIMIT_EXCEEDED"
    | "DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID"
    | "DEVELOPMENT_PRIVATE_IMPORT_INVARIANT_UNRESOLVED"
    | "DEVELOPMENT_PRIVATE_IMPORT_PLAN_RECEIPT_MISMATCH"
    | "DEVELOPMENT_PRIVATE_IMPORT_OPERATION_CONFLICT"
    | "DEVELOPMENT_PRIVATE_IMPORT_CONCURRENT_CHANGE"
    | "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE";

  constructor(code: DevelopmentPrivateWorkspaceImportError["code"]) {
    super(code);
    this.code = code;
    this.name = "DevelopmentPrivateWorkspaceImportError";
  }
}

function fail(code: DevelopmentPrivateWorkspaceImportError["code"]): never {
  throw new DevelopmentPrivateWorkspaceImportError(code);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
  return value as Record<string, unknown>;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const input = value as Record<string, unknown>;
  return `{${Object.keys(input).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(input[key])}`
  )).join(",")}}`;
}

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value: unknown) {
  return sha256(canonicalJson(value));
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== [...expected].sort()[index])) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_INPUT_INVALID");
  }
}

function jsonEntry(entries: ReadonlyMap<string, Buffer>, path: string) {
  const value = entries.get(path);
  if (!value) fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  try {
    return record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value)));
  } catch (error) {
    if (error instanceof DevelopmentPrivateWorkspaceImportError) throw error;
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
}

function assertDeterministicRegularFileZip(archive: Uint8Array) {
  const value = Buffer.from(archive);
  const end = value.length - 22;
  if (end < 0 || value.readUInt32LE(end) !== 0x06054b50) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_INVALID");
  }
  const count = value.readUInt16LE(end + 10);
  let cursor = value.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > end || value.readUInt32LE(cursor) !== 0x02014b50) {
      fail("DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_INVALID");
    }
    const versionMadeBy = value.readUInt16LE(cursor + 4);
    const diskStart = value.readUInt16LE(cursor + 34);
    const internalAttributes = value.readUInt16LE(cursor + 36);
    const externalAttributes = value.readUInt32LE(cursor + 38);
    if (versionMadeBy !== 20 || diskStart !== 0 || internalAttributes !== 0 || externalAttributes !== 0) {
      fail("DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_SPECIAL_ENTRY");
    }
    cursor += 46
      + value.readUInt16LE(cursor + 28)
      + value.readUInt16LE(cursor + 30)
      + value.readUInt16LE(cursor + 32);
  }
  if (cursor !== end) fail("DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_INVALID");
}

function assertSmokePass(value: unknown) {
  const smoke = record(value);
  const blockerCodes = smoke.blockerCodes;
  if (
    smoke.manifestValidation !== "PASS"
    || smoke.clientBoot !== "PASS"
    || (smoke.serverInitialization !== "PASS" && smoke.serverInitialization !== "NOT_REQUIRED")
    || smoke.basicInteraction !== "PASS"
    || smoke.statePresentationReconciliation !== "PASS"
    || smoke.requiredAssets !== "PASS"
    || smoke.networkDependency !== "NONE"
    || !Array.isArray(blockerCodes)
    || blockerCodes.length !== 0
  ) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
}

function assertPackageClosure(gameId: string, files: ReadonlyMap<string, Buffer>) {
  if (!files.has("index.html")) fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  const packageBytes = files.get("game-fields-package.json");
  if (!packageBytes) return;
  let packageDocument: Record<string, unknown>;
  try {
    packageDocument = record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(packageBytes)));
  } catch (error) {
    if (error instanceof DevelopmentPrivateWorkspaceImportError) throw error;
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
  const client = record(packageDocument.client);
  const server = record(packageDocument.server);
  if (packageDocument.schemaVersion !== 1 || packageDocument.gameId !== gameId) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
  if (typeof client.entry !== "string" || !files.has(client.entry)) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
  if (
    typeof server.entry !== "string"
    || typeof server.bundleSha256 !== "string"
    || typeof server.appSetSource !== "string"
    || typeof server.appSetSourceSha256 !== "string"
    || sha256(files.get(server.entry) ?? Buffer.alloc(0)) !== server.bundleSha256
    || sha256(files.get(server.appSetSource) ?? Buffer.alloc(0)) !== server.appSetSourceSha256
  ) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
}

function normalizeSpec(
  target: DevelopmentPrivateWorkspaceImportTarget,
  specs: Readonly<Record<DevelopmentPrivateWorkspaceImportTarget, DevelopmentPrivateWorkspaceImportTargetSpec>>,
) {
  const spec = specs[target];
  if (
    spec.target !== target
    || !Number.isSafeInteger(spec.bundleBytes)
    || !Number.isSafeInteger(spec.gameCount)
    || spec.gameCount < 1
    || !sha256Pattern.test(spec.bundleSha256)
    || !sha256Pattern.test(spec.gameIdentitySetSha256)
    || !sha256Pattern.test(spec.perGameIdentitySha256)
  ) fail("DEVELOPMENT_PRIVATE_IMPORT_INVARIANT_UNRESOLVED");
  return spec;
}

export function validateDevelopmentPrivateWorkspaceBundle(input: {
  target: DevelopmentPrivateWorkspaceImportTarget;
  archive: Uint8Array;
  specs?: Readonly<Record<DevelopmentPrivateWorkspaceImportTarget, DevelopmentPrivateWorkspaceImportTargetSpec>>;
}): ValidatedDevelopmentPrivateWorkspaceBundle {
  const specs = input.specs ?? developmentPrivateWorkspaceImportTargetSpecs;
  const spec = normalizeSpec(input.target, specs);
  const archive = Buffer.from(input.archive);
  if (archive.byteLength > maximumArchiveBytes) fail("DEVELOPMENT_PRIVATE_IMPORT_LIMIT_EXCEEDED");
  if (archive.byteLength !== spec.bundleBytes || sha256(archive) !== spec.bundleSha256) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH");
  }
  assertDeterministicRegularFileZip(archive);
  let extracted: StoredZipEntry[];
  try {
    extracted = extractStoredZip(archive);
  } catch {
    fail("DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_INVALID");
  }
  const payloadBytes = extracted.reduce((sum, entry) => sum + entry.content.byteLength, 0);
  if (
    extracted.length > maximumEntries
    || payloadBytes > maximumPayloadBytes
    || extracted.some((entry) => entry.content.byteLength > maximumEntryBytes)
  ) fail("DEVELOPMENT_PRIVATE_IMPORT_LIMIT_EXCEEDED");
  const entries = new Map(extracted.map((entry) => [entry.name, entry.content]));
  const manifestBytes = entries.get("workspace-manifest.json");
  const ledgerBytes = entries.get("per-game-ledger.json");
  const deferredBytes = entries.get("deferred-historical-material.json");
  if (!manifestBytes || !ledgerBytes || !deferredBytes) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
  const manifest = jsonEntry(entries, "workspace-manifest.json");
  const ledger = jsonEntry(entries, "per-game-ledger.json");
  const deferred = jsonEntry(entries, "deferred-historical-material.json");
  if (
    manifest.schemaVersion !== 1
    || manifest.phaseId !== "T-131-A4"
    || manifest.artifactType !== "PRIVATE_LOCAL_AUTHORING_WORKSPACE_BUNDLE"
    || manifest.target !== input.target
    || manifest.localParent !== t131A4Parent
    || manifest.gameCount !== spec.gameCount
    || manifest.readyGameCount !== spec.gameCount
    || manifest.blockedGameCount !== 0
    || manifest.state !== "LOCAL_AUTHORING_WORKSPACE_READY"
    || manifest.transferAuthorized !== false
    || manifest.ownerBindingApplied !== false
    || manifest.releasePublicationApplied !== false
    || manifest.externalWrites !== 0
    || manifest.ownerReference !== null
    || typeof manifest.creatorRowId !== "string"
    || !uuidPattern.test(manifest.creatorRowId)
    || manifest.perGameLedgerSha256 !== sha256(ledgerBytes)
  ) fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  const a0 = record(manifest.a0);
  if (a0.bytes !== t131A4A0Bytes || a0.sha256 !== t131A4A0Sha256) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
  if (
    ledger.schemaVersion !== 1
    || ledger.target !== input.target
    || deferred.schemaVersion !== 1
    || deferred.target !== input.target
    || !Array.isArray(ledger.games)
    || ledger.games.length !== spec.gameCount
    || !Array.isArray(deferred.games)
    || deferred.games.length !== spec.gameCount
  ) fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");

  const ledgerGames = ledger.games.map(record);
  const ids = ledgerGames.map((game) => game.gameId);
  if (
    ids.some((gameId) => typeof gameId !== "string" || !gameIdPattern.test(gameId))
    || new Set(ids).size !== ids.length
  ) fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  const gameIds = (ids as string[]).sort();
  if (digest(gameIds) !== spec.gameIdentitySetSha256) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
  const perGameIdentity = ledgerGames.map((game) => ({
    gameId: game.gameId,
    reconstructionMode: game.reconstructionMode,
    originalRevision: game.originalRevision,
    currentOutputSha256: game.currentOutputSha256,
    packageRootSha256: game.packageRootSha256,
    serverBundleSha256: game.serverBundleSha256,
    appSetSourceSha256: game.appSetSourceSha256,
  })).sort((left, right) => String(left.gameId).localeCompare(String(right.gameId)));
  if (digest(perGameIdentity) !== spec.perGameIdentitySha256) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }

  const expectedPaths = new Set([
    "workspace-manifest.json",
    "per-game-ledger.json",
    "deferred-historical-material.json",
  ]);
  const games: DevelopmentPrivateWorkspaceImportGame[] = [];
  for (const ledgerGame of ledgerGames.sort((left, right) => String(left.gameId).localeCompare(String(right.gameId)))) {
    const gameId = ledgerGame.gameId as string;
    if (
      ledgerGame.target !== input.target
      || ledgerGame.reconstruction !== "READY"
      || !Array.isArray(ledgerGame.blockerCodes)
      || ledgerGame.blockerCodes.length !== 0
      || !sha256Pattern.test(String(ledgerGame.currentOutputSha256 ?? ""))
    ) fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
    assertSmokePass(ledgerGame.smoke);
    const mode = ledgerGame.reconstructionMode;
    if (mode !== "ARTIFACT_HEAD" && mode !== "DEFINITION_BACKED_SEMANTIC_REBUILD") {
      fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
    }
    if (mode === "ARTIFACT_HEAD" && !sha1Pattern.test(String(ledgerGame.originalRevision ?? ""))) {
      fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
    }
    if (mode === "DEFINITION_BACKED_SEMANTIC_REBUILD" && ledgerGame.originalRevision !== null) {
      fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
    }
    const workspacePath = `games/${gameId}/workspace.json`;
    expectedPaths.add(workspacePath);
    const workspaceBytes = entries.get(workspacePath);
    if (!workspaceBytes) fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
    const workspace = jsonEntry(entries, workspacePath);
    if (
      workspace.schemaVersion !== 1
      || workspace.target !== input.target
      || workspace.gameId !== gameId
      || workspace.ownerReference !== null
      || workspace.historicalRestorationClaim !== false
      || workspace.externalWrites !== 0
      || canonicalJson(workspace.runtimeSmoke) !== canonicalJson(ledgerGame.smoke)
    ) fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
    if (mode === "DEFINITION_BACKED_SEMANTIC_REBUILD") {
      const definition = record(workspace.definitionBackedRebuild);
      if (
        workspace.authoringHead !== null
        || definition.mode !== "DEFINITION_BACKED_SEMANTIC_REBUILD"
        || definition.historicalArtifactHead !== "ABSENT"
        || definition.historicalRestorationClaim !== false
      ) fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
    } else {
      const head = record(workspace.authoringHead);
      if (
        head.revision !== ledgerGame.originalRevision
        || workspace.definitionBackedRebuild !== null
      ) fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
    }
    const runtimePrefix = `games/${gameId}/runtime/`;
    const runtimeEntries = extracted
      .filter((entry) => entry.name.startsWith(runtimePrefix))
      .map((entry) => ({ path: entry.name.slice(runtimePrefix.length), content: entry.content }))
      .sort((left, right) => left.path.localeCompare(right.path));
    if (runtimeEntries.length === 0 || runtimeEntries.some((entry) => !entry.path)) {
      fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
    }
    const runtimeMap = new Map(runtimeEntries.map((entry) => [entry.path, entry.content]));
    assertPackageClosure(gameId, runtimeMap);
    const runtimeFiles = runtimeEntries.map((entry) => {
      expectedPaths.add(`${runtimePrefix}${entry.path}`);
      return {
        path: entry.path,
        bytes: entry.content.byteLength,
        sha256: sha256(entry.content),
        content: Buffer.from(entry.content),
      };
    });
    games.push({
      gameId,
      reconstructionMode: mode,
      originalRevision: ledgerGame.originalRevision as string | null,
      workspaceDocument: workspace,
      workspaceDocumentSha256: sha256(workspaceBytes),
      provenanceSha256: digest(workspace.provenance),
      runtimeFilesSha256: digest(runtimeFiles.map(({ path, bytes, sha256: fileSha256 }) => ({
        path, bytes, sha256: fileSha256,
      }))),
      runtimeFiles,
    });
  }
  if (extracted.some((entry) => !expectedPaths.has(entry.name)) || expectedPaths.size !== extracted.length) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
  const deferredIds = deferred.games.map((value) => record(value).gameId).sort();
  if (canonicalJson(deferredIds) !== canonicalJson(gameIds)) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID");
  }
  const contentSetSha256 = digest(games.map((game) => ({
    gameId: game.gameId,
    workspaceDocumentSha256: game.workspaceDocumentSha256,
    provenanceSha256: game.provenanceSha256,
    runtimeFilesSha256: game.runtimeFilesSha256,
  })));
  return {
    target: input.target,
    environment: developmentPrivateWorkspaceImportEnvironment,
    schemaVersion: developmentPrivateWorkspaceImportSchemaVersion,
    bundleBytes: archive.byteLength,
    bundleSha256: sha256(archive),
    gameCount: games.length,
    gameIdentitySetSha256: spec.gameIdentitySetSha256,
    perGameIdentitySha256: spec.perGameIdentitySha256,
    contentSetSha256,
    workspaceManifestSha256: sha256(manifestBytes),
    perGameLedgerSha256: sha256(ledgerBytes),
    entryCount: extracted.length,
    runtimeFileCount: games.reduce((total, game) => total + game.runtimeFiles.length, 0),
    runtimeBytes: games.reduce((total, game) => total
      + game.runtimeFiles.reduce((sum, file) => sum + file.bytes, 0), 0),
    creatorRowId: manifest.creatorRowId,
    workspaceManifest: manifest,
    games,
  };
}

export function assertDevelopmentPrivateWorkspaceImportBeforeState(
  state: DevelopmentPrivateWorkspaceImportBeforeState,
  bundle: ValidatedDevelopmentPrivateWorkspaceBundle,
) {
  if (
    state.targetCreatorRowId !== bundle.creatorRowId
    || state.targetCreatorRows !== 1
    || state.targetDeletedCreatorRows !== 1
    || state.targetCreatorOwnerRows !== 0
    || state.targetGameRows !== bundle.gameCount
    || state.targetDeletedGameRows !== bundle.gameCount
    || state.targetActiveGameRows !== 0
    || state.targetReleaseRows !== 0
    || state.targetCurrentReleaseRows !== 0
    || state.targetWorkspaceRows !== 0
    || state.targetWorkspaceGameRows !== 0
    || state.targetWorkspaceFileRows !== 0
    || !sha256Pattern.test(state.sourceStateToken)
    || !sha256Pattern.test(state.publicStateToken)
    || !sha256Pattern.test(state.unrelatedPrivateStateToken)
  ) fail("DEVELOPMENT_PRIVATE_IMPORT_INVARIANT_UNRESOLVED");
}

function beforeStateSha256(
  state: DevelopmentPrivateWorkspaceImportBeforeState,
  bundle: ValidatedDevelopmentPrivateWorkspaceBundle,
) {
  assertDevelopmentPrivateWorkspaceImportBeforeState(state, bundle);
  return digest(state);
}

function planFrom(
  bundle: ValidatedDevelopmentPrivateWorkspaceBundle,
  state: DevelopmentPrivateWorkspaceImportBeforeState,
): DevelopmentPrivateWorkspaceImportPlan {
  const stateSha256 = beforeStateSha256(state, bundle);
  const bundleReceipt = {
    bytes: bundle.bundleBytes,
    sha256: bundle.bundleSha256,
    schemaVersion: bundle.schemaVersion,
    gameCount: bundle.gameCount,
    gameIdentitySetSha256: bundle.gameIdentitySetSha256,
    perGameIdentitySha256: bundle.perGameIdentitySha256,
    contentSetSha256: bundle.contentSetSha256,
  } as const;
  const intendedMutations = {
    privateWorkspaceRows: 1,
    privateGameRows: bundle.gameCount,
    privateFileRows: bundle.runtimeFileCount,
    visibility: "private-quarantined",
    ownerBinding: "unbound",
    grants: 0,
    releases: 0,
    publications: 0,
    aliases: 0,
    rooms: 0,
  } as const;
  const planReceipt = digest({
    schemaVersion: 1,
    environment: developmentPrivateWorkspaceImportEnvironment,
    target: bundle.target,
    intent: developmentPrivateWorkspaceImportIntent,
    bundle: bundleReceipt,
    intendedMutations,
    beforeStateSha256: stateSha256,
  });
  return {
    schemaVersion: 1,
    environment: developmentPrivateWorkspaceImportEnvironment,
    target: bundle.target,
    phase: "plan",
    writesPerformed: 0,
    bundle: bundleReceipt,
    intendedMutations,
    beforeStateSha256: stateSha256,
    planReceipt,
  };
}

export async function prepareDevelopmentPrivateWorkspaceImportPlan(input: {
  target: DevelopmentPrivateWorkspaceImportTarget;
  archive: Uint8Array;
  adapter: DevelopmentPrivateWorkspaceImportAdapter;
  specs?: Readonly<Record<DevelopmentPrivateWorkspaceImportTarget, DevelopmentPrivateWorkspaceImportTargetSpec>>;
}) {
  const bundle = validateDevelopmentPrivateWorkspaceBundle(input);
  const beforeState = await input.adapter.readBeforeState(input.target);
  return { bundle, beforeState, response: planFrom(bundle, beforeState) };
}

export function parseDevelopmentPrivateWorkspaceImportExecuteIdentity(value: unknown) {
  const input = record(value);
  exactKeys(input, ["operationId", "planReceipt"]);
  if (
    typeof input.operationId !== "string"
    || !uuidPattern.test(input.operationId)
    || typeof input.planReceipt !== "string"
    || !sha256Pattern.test(input.planReceipt)
  ) fail("DEVELOPMENT_PRIVATE_IMPORT_INPUT_INVALID");
  return { operationId: input.operationId.toLowerCase(), planReceipt: input.planReceipt };
}

export function parseDevelopmentPrivateWorkspaceImportStatusIdentity(value: unknown) {
  const input = record(value);
  exactKeys(input, ["bundleSha256", "operationId", "planReceipt"]);
  if (
    typeof input.operationId !== "string"
    || !uuidPattern.test(input.operationId)
    || typeof input.planReceipt !== "string"
    || !sha256Pattern.test(input.planReceipt)
    || typeof input.bundleSha256 !== "string"
    || !sha256Pattern.test(input.bundleSha256)
  ) fail("DEVELOPMENT_PRIVATE_IMPORT_INPUT_INVALID");
  return {
    operationId: input.operationId.toLowerCase(),
    planReceipt: input.planReceipt,
    bundleSha256: input.bundleSha256,
  };
}

function terminalFrom(input: {
  bundle: ValidatedDevelopmentPrivateWorkspaceBundle;
  operationId: string;
  planReceipt: string;
  replayed: boolean;
  readBack: DevelopmentPrivateWorkspaceImportReadBack;
}): DevelopmentPrivateWorkspaceImportTerminalReceipt {
  const readBackSha256 = digest(input.readBack);
  const bundle = {
    bytes: input.bundle.bundleBytes,
    sha256: input.bundle.bundleSha256,
    schemaVersion: input.bundle.schemaVersion,
    gameCount: input.bundle.gameCount,
    gameIdentitySetSha256: input.bundle.gameIdentitySetSha256,
    perGameIdentitySha256: input.bundle.perGameIdentitySha256,
    contentSetSha256: input.bundle.contentSetSha256,
  } as const;
  const terminalReceipt = digest({
    schemaVersion: 1,
    environment: developmentPrivateWorkspaceImportEnvironment,
    target: input.bundle.target,
    intent: developmentPrivateWorkspaceImportIntent,
    operationId: input.operationId,
    planReceipt: input.planReceipt,
    bundle,
    readBackSha256,
    state: "completed",
  });
  return {
    schemaVersion: 1,
    environment: developmentPrivateWorkspaceImportEnvironment,
    target: input.bundle.target,
    phase: "execute",
    operationId: input.operationId,
    state: "completed",
    visibility: "private-quarantined",
    ownerBinding: "unbound",
    logicalWrites: input.replayed ? 0 : 1,
    replayed: input.replayed,
    bundle,
    imported: {
      workspaceRows: 1,
      gameRows: input.readBack.targetWorkspaceGameRows,
      fileRows: input.readBack.targetWorkspaceFileRows,
    },
    nonEffects: {
      unrelatedTarget: "byte-for-byte-unchanged",
      sourceWorkspace: "row-for-row-unchanged",
      grants: 0,
      releases: 0,
      publications: 0,
      aliases: 0,
      rooms: 0,
    },
    readBackSha256,
    terminalReceipt,
  };
}

function assertReadBack(
  bundle: ValidatedDevelopmentPrivateWorkspaceBundle,
  before: DevelopmentPrivateWorkspaceImportBeforeState,
  readBack: DevelopmentPrivateWorkspaceImportReadBack,
) {
  if (
    readBack.targetWorkspaceRows !== 1
    || readBack.targetWorkspaceGameRows !== bundle.gameCount
    || readBack.targetWorkspaceFileRows !== bundle.runtimeFileCount
    || readBack.bundleSha256 !== bundle.bundleSha256
    || readBack.gameIdentitySetSha256 !== bundle.gameIdentitySetSha256
    || readBack.perGameIdentitySha256 !== bundle.perGameIdentitySha256
    || readBack.contentSetSha256 !== bundle.contentSetSha256
    || readBack.sourceStateToken !== before.sourceStateToken
    || readBack.publicStateToken !== before.publicStateToken
    || readBack.unrelatedPrivateStateToken !== before.unrelatedPrivateStateToken
    || readBack.ownerBindingRows !== 0
    || readBack.grantRows !== 0
    || readBack.releaseRows !== 0
    || readBack.publicationRows !== 0
    || readBack.aliasRows !== 0
    || readBack.roomRows !== 0
  ) fail("DEVELOPMENT_PRIVATE_IMPORT_CONCURRENT_CHANGE");
}

function expectedReadBackFrom(
  bundle: ValidatedDevelopmentPrivateWorkspaceBundle,
  before: DevelopmentPrivateWorkspaceImportBeforeState,
): DevelopmentPrivateWorkspaceImportReadBack {
  return {
    targetWorkspaceRows: 1,
    targetWorkspaceGameRows: bundle.gameCount,
    targetWorkspaceFileRows: bundle.runtimeFileCount,
    bundleSha256: bundle.bundleSha256,
    gameIdentitySetSha256: bundle.gameIdentitySetSha256,
    perGameIdentitySha256: bundle.perGameIdentitySha256,
    contentSetSha256: bundle.contentSetSha256,
    sourceStateToken: before.sourceStateToken,
    publicStateToken: before.publicStateToken,
    unrelatedPrivateStateToken: before.unrelatedPrivateStateToken,
    ownerBindingRows: 0,
    grantRows: 0,
    releaseRows: 0,
    publicationRows: 0,
    aliasRows: 0,
    roomRows: 0,
  };
}

export async function executeDevelopmentPrivateWorkspaceImport(input: {
  target: DevelopmentPrivateWorkspaceImportTarget;
  archive: Uint8Array;
  identity: unknown;
  adapter: DevelopmentPrivateWorkspaceImportAdapter;
  specs?: Readonly<Record<DevelopmentPrivateWorkspaceImportTarget, DevelopmentPrivateWorkspaceImportTargetSpec>>;
  faultAt?: DevelopmentPrivateWorkspaceImportFaultPoint;
}) {
  const identity = parseDevelopmentPrivateWorkspaceImportExecuteIdentity(input.identity);
  const bundle = validateDevelopmentPrivateWorkspaceBundle(input);
  const completed = await input.adapter.readCompletedOperation(identity.operationId);
  if (completed) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_OPERATION_CONFLICT");
  }
  const beforeState = await input.adapter.readBeforeState(input.target);
  const plan = planFrom(bundle, beforeState);
  if (identity.planReceipt !== plan.planReceipt) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_PLAN_RECEIPT_MISMATCH");
  }
  const expectedReadBack = expectedReadBackFrom(bundle, beforeState);
  const expectedTerminal = terminalFrom({
    bundle,
    operationId: identity.operationId,
    planReceipt: identity.planReceipt,
    replayed: false,
    readBack: expectedReadBack,
  });
  const executed = await input.adapter.importAtomic({
    bundle,
    beforeState,
    beforeStateSha256: plan.beforeStateSha256,
    operationId: identity.operationId,
    planReceipt: identity.planReceipt,
    terminalReceipt: expectedTerminal.terminalReceipt,
    readBackSha256: expectedTerminal.readBackSha256,
    expectedReadBack,
    ...(input.faultAt ? { faultAt: input.faultAt } : {}),
  });
  if (executed.replayed) fail("DEVELOPMENT_PRIVATE_IMPORT_OPERATION_CONFLICT");
  assertReadBack(bundle, beforeState, executed.readBack);
  return terminalFrom({
    bundle,
    operationId: identity.operationId,
    planReceipt: identity.planReceipt,
    replayed: executed.replayed,
    readBack: executed.readBack,
  });
}

export async function readDevelopmentPrivateWorkspaceImportStatus(input: {
  target: DevelopmentPrivateWorkspaceImportTarget;
  identity: unknown;
  adapter: Pick<DevelopmentPrivateWorkspaceImportAdapter, "readCompletedOperation">;
  specs?: Readonly<Record<DevelopmentPrivateWorkspaceImportTarget, DevelopmentPrivateWorkspaceImportTargetSpec>>;
}): Promise<DevelopmentPrivateWorkspaceImportStatus> {
  const identity = parseDevelopmentPrivateWorkspaceImportStatusIdentity(input.identity);
  const spec = normalizeSpec(
    input.target,
    input.specs ?? developmentPrivateWorkspaceImportTargetSpecs,
  );
  if (identity.bundleSha256 !== spec.bundleSha256) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH");
  }
  const completed = await input.adapter.readCompletedOperation(identity.operationId);
  if (!completed) {
    return {
      schemaVersion: 1,
      environment: developmentPrivateWorkspaceImportEnvironment,
      target: input.target,
      phase: "status",
      operationId: identity.operationId,
      state: "not-found",
      acceptance: null,
    };
  }
  if (
    completed.target !== input.target
    || completed.operationId !== identity.operationId
    || completed.planReceipt !== identity.planReceipt
    || completed.bundleSha256 !== identity.bundleSha256
  ) fail("DEVELOPMENT_PRIVATE_IMPORT_OPERATION_CONFLICT");

  const readBack = completed.readBack;
  if (
    readBack.targetWorkspaceRows !== 1
    || readBack.targetWorkspaceGameRows !== spec.gameCount
    || !Number.isSafeInteger(readBack.targetWorkspaceFileRows)
    || readBack.targetWorkspaceFileRows < 1
    || readBack.bundleSha256 !== spec.bundleSha256
    || readBack.gameIdentitySetSha256 !== spec.gameIdentitySetSha256
    || readBack.perGameIdentitySha256 !== spec.perGameIdentitySha256
    || !sha256Pattern.test(readBack.contentSetSha256)
    || !sha256Pattern.test(readBack.sourceStateToken)
    || !sha256Pattern.test(readBack.publicStateToken)
    || !sha256Pattern.test(readBack.unrelatedPrivateStateToken)
    || readBack.ownerBindingRows !== 0
    || readBack.grantRows !== 0
    || readBack.releaseRows !== 0
    || readBack.publicationRows !== 0
    || readBack.aliasRows !== 0
    || readBack.roomRows !== 0
  ) fail("DEVELOPMENT_PRIVATE_IMPORT_CONCURRENT_CHANGE");

  const acceptanceBase = {
    workspaceId: identity.operationId,
    workspaceRows: 1 as const,
    gameRows: readBack.targetWorkspaceGameRows,
    fileRows: readBack.targetWorkspaceFileRows,
    bundleBytes: spec.bundleBytes,
    bundleSha256: spec.bundleSha256,
    gameIdentitySetSha256: spec.gameIdentitySetSha256,
    perGameIdentitySha256: spec.perGameIdentitySha256,
    contentSetSha256: readBack.contentSetSha256,
    visibility: "private-quarantined" as const,
    private: true as const,
    quarantined: true as const,
    ownerBinding: "unbound" as const,
    ownerBindingRows: 0 as const,
    grants: 0 as const,
    releases: 0 as const,
    publications: 0 as const,
    aliases: 0 as const,
    rooms: 0 as const,
  };
  return {
    schemaVersion: 1,
    environment: developmentPrivateWorkspaceImportEnvironment,
    target: input.target,
    phase: "status",
    operationId: identity.operationId,
    state: "completed",
    acceptance: {
      ...acceptanceBase,
      statusReceipt: digest({
        schemaVersion: 1,
        environment: developmentPrivateWorkspaceImportEnvironment,
        target: input.target,
        operationId: identity.operationId,
        planReceipt: identity.planReceipt,
        state: "completed",
        acceptance: acceptanceBase,
      }),
    },
  };
}

export async function readDevelopmentPrivateWorkspaceImportBody(
  request: Request,
  target: DevelopmentPrivateWorkspaceImportTarget,
) {
  if (request.headers.get("content-type") !== "application/zip") {
    fail("DEVELOPMENT_PRIVATE_IMPORT_INPUT_INVALID");
  }
  const expected = developmentPrivateWorkspaceImportTargetSpecs[target].bundleBytes;
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) !== expected) {
    fail("DEVELOPMENT_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH");
  }
  if (!request.body) fail("DEVELOPMENT_PRIVATE_IMPORT_INPUT_INVALID");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumArchiveBytes || bytes > expected) {
      await reader.cancel();
      fail("DEVELOPMENT_PRIVATE_IMPORT_LIMIT_EXCEEDED");
    }
    chunks.push(Buffer.from(value));
  }
  if (bytes !== expected) fail("DEVELOPMENT_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH");
  return Buffer.concat(chunks);
}

export function developmentPrivateWorkspaceImportErrorStatus(error: unknown) {
  if (!(error instanceof DevelopmentPrivateWorkspaceImportError)) return 503;
  if (
    error.code === "DEVELOPMENT_PRIVATE_IMPORT_INPUT_INVALID"
    || error.code === "DEVELOPMENT_PRIVATE_IMPORT_TARGET_INVALID"
    || error.code === "DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_INVALID"
    || error.code === "DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_SPECIAL_ENTRY"
    || error.code === "DEVELOPMENT_PRIVATE_IMPORT_LIMIT_EXCEEDED"
    || error.code === "DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID"
  ) return 400;
  if (error.code === "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE") return 503;
  return 409;
}
