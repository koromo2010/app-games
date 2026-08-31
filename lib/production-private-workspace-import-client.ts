import {
  productionPrivateWorkspaceImportRecoveryIdentity,
  productionPrivateWorkspaceImportTargetSpec,
  type ProductionPrivateWorkspaceImportTarget,
} from "../apps/sdk-portal/lib/production-private-workspace-import-public-contract.ts";

const sha256Pattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const storedZipUtf8Flag = 0x0800;
const storedZipMaximumEntries = 16_384;

const storedZipCrcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return value >>> 0;
});

export type VerifiedProductionPrivateWorkspaceImportFile = {
  target: ProductionPrivateWorkspaceImportTarget;
  file: File;
  bytes: number;
  sha256: string;
  operationId: string;
  manifest: {
    entryCount: number;
    runtimeFileCount: number;
    workspaceManifestSha256: string;
    perGameLedgerSha256: string;
    creatorIdentitySha256: string;
    gameCount: number;
  };
};

export type ProductionPrivateWorkspaceImportTargetState = {
  target: ProductionPrivateWorkspaceImportTarget;
  ready: boolean;
  creatorIdentitySha256: string | null;
  counts: Record<string, number>;
  recoveryIdentityExact: boolean;
};

export type ProductionPrivateWorkspaceImportPlan = {
  planReceipt: string;
  beforeStateSha256: string;
  fileRows: number;
  contentSetSha256: string;
};

export type ProductionPrivateWorkspaceImportAcceptance = {
  workspaceId: string;
  workspaceRows: 1;
  gameRows: number;
  fileRows: number;
  bundleBytes: number;
  bundleSha256: string;
  workspaceManifestSha256: string;
  perGameLedgerSha256: string;
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
  publicExposure: 0;
  statusReceipt: string;
};

function toHex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(bytes: ArrayBuffer | Uint8Array, browserCrypto: Pick<Crypto, "subtle">) {
  const source = bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes).buffer;
  return toHex(await browserCrypto.subtle.digest("SHA-256", source));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function storedZipCrc32(content: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of content) crc = (crc >>> 8) ^ storedZipCrcTable[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function storedZipEntries(archive: ArrayBuffer) {
  const bytes = new Uint8Array(archive);
  const view = new DataView(archive);
  const end = bytes.byteLength - 22;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) {
    throw new Error("ZIP_INVALID");
  }
  const disk = view.getUint16(end + 4, true);
  const directoryDisk = view.getUint16(end + 6, true);
  const entriesOnDisk = view.getUint16(end + 8, true);
  const count = view.getUint16(end + 10, true);
  const directoryBytes = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  const commentBytes = view.getUint16(end + 20, true);
  if (
    disk !== 0
    || directoryDisk !== 0
    || entriesOnDisk !== count
    || count > storedZipMaximumEntries
    || commentBytes !== 0
    || directoryOffset + directoryBytes !== end
  ) throw new Error("ZIP_INVALID");
  let cursor = directoryOffset;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries = new Map<string, Uint8Array>();
  const foldedNames = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("ZIP_INVALID");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressed = view.getUint32(cursor + 20, true);
    const uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      flags !== storedZipUtf8Flag
      || method !== 0
      || compressed !== uncompressed
      || next > end
      || localOffset + 30 > directoryOffset
      || view.getUint32(localOffset, true) !== 0x04034b50
    ) {
      throw new Error("ZIP_INVALID");
    }
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const foldedName = name.toLocaleLowerCase("en-US");
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localCrc = view.getUint32(localOffset + 14, true);
    const localCompressed = view.getUint32(localOffset + 18, true);
    const localUncompressed = view.getUint32(localOffset + 22, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    const dataEnd = dataStart + uncompressed;
    if (
      !name
      || name.length > 1_024
      || name.startsWith("/")
      || name.includes("\\")
      || name.includes("\0")
      || name.split("/").some((part) => part === "" || part === "." || part === "..")
      || entries.has(name)
      || foldedNames.has(foldedName)
      || localNameEnd > directoryOffset
      || !equalBytes(bytes.slice(localNameStart, localNameEnd), bytes.slice(cursor + 46, cursor + 46 + nameLength))
      || localFlags !== flags
      || localMethod !== method
      || localCrc !== expectedCrc
      || localCompressed !== compressed
      || localUncompressed !== uncompressed
      || dataEnd > directoryOffset
    ) throw new Error("ZIP_INVALID");
    const content = bytes.slice(dataStart, dataEnd);
    if (storedZipCrc32(content) !== expectedCrc) throw new Error("ZIP_INVALID");
    entries.set(name, content);
    foldedNames.add(foldedName);
    cursor = next;
  }
  if (cursor !== end || entries.size !== count) throw new Error("ZIP_INVALID");
  return entries;
}

function parseJson(entries: ReadonlyMap<string, Uint8Array>, path: string) {
  const bytes = entries.get(path);
  if (!bytes) throw new Error("CONTENT_INVALID");
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const parsed = record(value);
  if (!parsed) throw new Error("CONTENT_INVALID");
  return { bytes, value: parsed };
}

export async function verifyProductionPrivateWorkspaceImportFileAgainstSpec(
  file: File,
  target: ProductionPrivateWorkspaceImportTarget,
  expectedSpec: {
    target: ProductionPrivateWorkspaceImportTarget;
    bundleBytes: number;
    bundleSha256: string;
    gameCount: number;
  },
  browserCrypto: Pick<Crypto, "subtle"> = crypto,
): Promise<
  | { kind: "verified"; value: VerifiedProductionPrivateWorkspaceImportFile }
  | { kind: "rejected"; code: "BUNDLE_IDENTITY_MISMATCH" | "BUNDLE_CONTENT_INVALID" | "BROWSER_CRYPTO_UNAVAILABLE" }
> {
  if (target !== expectedSpec.target || file.size !== expectedSpec.bundleBytes) {
    return { kind: "rejected", code: "BUNDLE_IDENTITY_MISMATCH" };
  }
  try {
    const archive = await file.arrayBuffer();
    const sha256 = await digest(archive, browserCrypto);
    if (sha256 !== expectedSpec.bundleSha256) {
      return { kind: "rejected", code: "BUNDLE_IDENTITY_MISMATCH" };
    }
    const entries = storedZipEntries(archive);
    const manifest = parseJson(entries, "workspace-manifest.json");
    const ledger = parseJson(entries, "per-game-ledger.json");
    const creatorRowId = manifest.value.creatorRowId;
    const ledgerGames = ledger.value.games;
    const runtimeFileCount = [...entries.keys()].filter((path) => /^games\/[a-z0-9-]+\/runtime\/.+/.test(path)).length;
    if (
      manifest.value.schemaVersion !== 1
      || manifest.value.phaseId !== "T-131-A4"
      || manifest.value.artifactType !== "PRIVATE_LOCAL_AUTHORING_WORKSPACE_BUNDLE"
      || manifest.value.target !== target
      || manifest.value.gameCount !== expectedSpec.gameCount
      || manifest.value.readyGameCount !== expectedSpec.gameCount
      || manifest.value.blockedGameCount !== 0
      || manifest.value.transferAuthorized !== false
      || manifest.value.ownerBindingApplied !== false
      || manifest.value.releasePublicationApplied !== false
      || manifest.value.externalWrites !== 0
      || manifest.value.ownerReference !== null
      || typeof creatorRowId !== "string"
      || !uuidPattern.test(creatorRowId)
      || ledger.value.schemaVersion !== 1
      || ledger.value.target !== target
      || !Array.isArray(ledgerGames)
      || ledgerGames.length !== expectedSpec.gameCount
      || runtimeFileCount < expectedSpec.gameCount
    ) return { kind: "rejected", code: "BUNDLE_CONTENT_INVALID" };
    const perGameLedgerSha256 = await digest(ledger.bytes, browserCrypto);
    if (manifest.value.perGameLedgerSha256 !== perGameLedgerSha256) {
      return { kind: "rejected", code: "BUNDLE_CONTENT_INVALID" };
    }
    const creatorIdentitySha256 = await digest(
      new TextEncoder().encode(`production-private-workspace:${creatorRowId}`),
      browserCrypto,
    );
    const operationHash = await digest(new TextEncoder().encode([
      "production-private-workspace-import-v1",
      target,
      sha256,
      await digest(manifest.bytes, browserCrypto),
      perGameLedgerSha256,
      creatorIdentitySha256,
    ].join("|")), browserCrypto);
    const operationChars = operationHash.slice(0, 32).split("");
    operationChars[12] = "5";
    operationChars[16] = "8";
    const compactOperation = operationChars.join("");
    const operationId = `${compactOperation.slice(0, 8)}-${compactOperation.slice(8, 12)}-${compactOperation.slice(12, 16)}-${compactOperation.slice(16, 20)}-${compactOperation.slice(20)}`;
    return {
      kind: "verified",
      value: {
        target,
        file,
        bytes: file.size,
        sha256,
        operationId,
        manifest: {
          entryCount: entries.size,
          runtimeFileCount,
          workspaceManifestSha256: await digest(manifest.bytes, browserCrypto),
          perGameLedgerSha256,
          creatorIdentitySha256,
          gameCount: expectedSpec.gameCount,
        },
      },
    };
  } catch {
    return { kind: "rejected", code: "BUNDLE_CONTENT_INVALID" };
  }
}

export async function verifyProductionPrivateWorkspaceImportFile(
  file: File,
  target: ProductionPrivateWorkspaceImportTarget,
  browserCrypto: Pick<Crypto, "subtle"> = crypto,
) {
  return verifyProductionPrivateWorkspaceImportFileAgainstSpec(
    file,
    target,
    productionPrivateWorkspaceImportTargetSpec,
    browserCrypto,
  );
}

export function parseProductionPrivateWorkspaceImportTargetState(
  value: unknown,
  target: ProductionPrivateWorkspaceImportTarget,
): ProductionPrivateWorkspaceImportTargetState | null {
  const input = record(value);
  const counts = record(input?.counts);
  const integrity = record(input?.integrity);
  if (
    !input || !counts || !integrity
    || input.schemaVersion !== 1 || input.environment !== "production"
    || input.target !== target || input.phase !== "target-state"
    || typeof input.ready !== "boolean"
    || (integrity.creatorIdentitySha256 !== null
      && (typeof integrity.creatorIdentitySha256 !== "string" || !sha256Pattern.test(integrity.creatorIdentitySha256)))
    || typeof integrity.recoveryIdentityExact !== "boolean"
    || Object.values(counts).some((entry) => !Number.isSafeInteger(entry) || Number(entry) < 0)
  ) return null;
  return {
    target,
    ready: input.ready,
    creatorIdentitySha256: integrity.creatorIdentitySha256 as string | null,
    counts: counts as Record<string, number>,
    recoveryIdentityExact: integrity.recoveryIdentityExact,
  };
}

export function parseProductionPrivateWorkspaceImportPlan(
  value: unknown,
  target: ProductionPrivateWorkspaceImportTarget,
  verified: VerifiedProductionPrivateWorkspaceImportFile,
): ProductionPrivateWorkspaceImportPlan | null {
  const input = record(value);
  const bundle = record(input?.bundle);
  const mutations = record(input?.intendedMutations);
  const recovery = record(input?.recoveryIdentity);
  if (
    !input || !bundle || !mutations || !recovery
    || input.schemaVersion !== 1 || input.environment !== "production" || input.target !== target
    || input.phase !== "plan" || input.writesPerformed !== 0
    || typeof input.planReceipt !== "string" || !sha256Pattern.test(input.planReceipt)
    || typeof input.beforeStateSha256 !== "string" || !sha256Pattern.test(input.beforeStateSha256)
    || bundle.bytes !== verified.bytes || bundle.sha256 !== verified.sha256
    || bundle.workspaceManifestSha256 !== verified.manifest.workspaceManifestSha256
    || bundle.perGameLedgerSha256 !== verified.manifest.perGameLedgerSha256
    || bundle.entryCount !== verified.manifest.entryCount
    || bundle.runtimeFileCount !== verified.manifest.runtimeFileCount
    || typeof bundle.contentSetSha256 !== "string" || !sha256Pattern.test(bundle.contentSetSha256)
    || recovery.operationId !== productionPrivateWorkspaceImportRecoveryIdentity.operationId
    || recovery.terminalReceipt !== productionPrivateWorkspaceImportRecoveryIdentity.terminalReceipt
    || mutations.privateWorkspaceRows !== 1 || mutations.privateGameRows !== 2
    || mutations.privateFileRows !== verified.manifest.runtimeFileCount
    || mutations.visibility !== "private-quarantined" || mutations.ownerBinding !== "unbound"
    || mutations.grants !== 0 || mutations.releases !== 0 || mutations.publications !== 0
    || mutations.aliases !== 0 || mutations.rooms !== 0
  ) return null;
  return {
    planReceipt: input.planReceipt,
    beforeStateSha256: input.beforeStateSha256,
    fileRows: mutations.privateFileRows as number,
    contentSetSha256: bundle.contentSetSha256,
  };
}

function acceptance(value: unknown, operationId: string): ProductionPrivateWorkspaceImportAcceptance | null {
  const input = record(value);
  if (
    !input
    || input.workspaceId !== operationId || input.workspaceRows !== 1 || input.gameRows !== 2
    || !Number.isSafeInteger(input.fileRows) || Number(input.fileRows) < 2
    || input.bundleBytes !== productionPrivateWorkspaceImportTargetSpec.bundleBytes
    || input.bundleSha256 !== productionPrivateWorkspaceImportTargetSpec.bundleSha256
    || typeof input.workspaceManifestSha256 !== "string" || !sha256Pattern.test(input.workspaceManifestSha256)
    || typeof input.perGameLedgerSha256 !== "string" || !sha256Pattern.test(input.perGameLedgerSha256)
    || typeof input.contentSetSha256 !== "string" || !sha256Pattern.test(input.contentSetSha256)
    || input.visibility !== "private-quarantined" || input.private !== true || input.quarantined !== true
    || input.ownerBinding !== "unbound" || input.ownerBindingRows !== 0
    || input.grants !== 0 || input.releases !== 0 || input.publications !== 0
    || input.aliases !== 0 || input.rooms !== 0 || input.publicExposure !== 0
    || typeof input.statusReceipt !== "string" || !sha256Pattern.test(input.statusReceipt)
  ) return null;
  return input as ProductionPrivateWorkspaceImportAcceptance;
}

export function parseProductionPrivateWorkspaceImportStatus(
  value: unknown,
  target: ProductionPrivateWorkspaceImportTarget,
  operationId: string,
) {
  const input = record(value);
  if (
    !input || input.schemaVersion !== 1 || input.environment !== "production" || input.target !== target
    || input.phase !== "status" || input.operationId !== operationId
  ) return null;
  if (input.state === "not-found" && input.acceptance === null) {
    return { state: "not-found" as const, operationId };
  }
  const parsed = input.state === "completed" ? acceptance(input.acceptance, operationId) : null;
  return parsed ? { state: "completed" as const, operationId, acceptance: parsed } : null;
}

export function parseProductionPrivateWorkspaceImportExecute(
  value: unknown,
  target: ProductionPrivateWorkspaceImportTarget,
  operationId: string,
) {
  const input = record(value);
  const imported = record(input?.imported);
  const nonEffects = record(input?.nonEffects);
  if (
    !input || !imported || !nonEffects
    || input.schemaVersion !== 1 || input.environment !== "production" || input.target !== target
    || input.phase !== "execute" || input.operationId !== operationId || input.state !== "completed"
    || input.visibility !== "private-quarantined" || input.private !== true || input.quarantined !== true
    || input.ownerBinding !== "unbound" || input.logicalWrites !== 1 || input.replayed !== false
    || imported.workspaceRows !== 1 || imported.gameRows !== 2 || !Number.isSafeInteger(imported.fileRows)
    || nonEffects.grants !== 0 || nonEffects.releases !== 0 || nonEffects.publications !== 0
    || nonEffects.aliases !== 0 || nonEffects.rooms !== 0 || nonEffects.publicExposure !== 0
    || typeof input.terminalReceipt !== "string" || !sha256Pattern.test(input.terminalReceipt)
  ) return null;
  return { operationId, terminalReceipt: input.terminalReceipt };
}
