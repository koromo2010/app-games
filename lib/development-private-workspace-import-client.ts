import {
  developmentPrivateWorkspaceImportTargetSpecs,
  type DevelopmentPrivateWorkspaceImportTarget,
} from "../apps/sdk-portal/lib/development-private-workspace-import-public-contract.ts";

const sha256Pattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VerifiedDevelopmentPrivateWorkspaceImportFile = {
  target: DevelopmentPrivateWorkspaceImportTarget;
  file: File;
  bytes: number;
  sha256: string;
  operationId: string;
};

export type DevelopmentPrivateWorkspaceImportClientPlan = {
  target: DevelopmentPrivateWorkspaceImportTarget;
  writesPerformed: 0;
  planReceipt: string;
  beforeStateSha256: string;
  privateGameRows: number;
  privateFileRows: number;
  contentSetSha256: string;
};

export type DevelopmentPrivateWorkspaceImportPlanAccess = {
  target: DevelopmentPrivateWorkspaceImportTarget;
  ready: true;
};

export type DevelopmentPrivateWorkspaceImportAcceptance = {
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
  statusReceipt: string | null;
};

export type DevelopmentPrivateWorkspaceImportClientStatus =
  | { state: "not-found"; operationId: string }
  | { state: "completed"; operationId: string; acceptance: DevelopmentPrivateWorkspaceImportAcceptance };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function exactBundle(
  value: unknown,
  target: DevelopmentPrivateWorkspaceImportTarget,
) {
  const input = record(value);
  const spec = developmentPrivateWorkspaceImportTargetSpecs[target];
  if (
    !input
    || !exactKeys(input, [
      "bytes",
      "contentSetSha256",
      "gameCount",
      "gameIdentitySetSha256",
      "perGameIdentitySha256",
      "schemaVersion",
      "sha256",
    ])
    || input.bytes !== spec.bundleBytes
    || input.sha256 !== spec.bundleSha256
    || input.schemaVersion !== 1
    || input.gameCount !== spec.gameCount
    || input.gameIdentitySetSha256 !== spec.gameIdentitySetSha256
    || input.perGameIdentitySha256 !== spec.perGameIdentitySha256
    || typeof input.contentSetSha256 !== "string"
    || !sha256Pattern.test(input.contentSetSha256)
  ) return null;
  return input as {
    bytes: number;
    sha256: string;
    schemaVersion: 1;
    gameCount: number;
    gameIdentitySetSha256: string;
    perGameIdentitySha256: string;
    contentSetSha256: string;
  };
}

function toHex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyDevelopmentPrivateWorkspaceImportFile(
  file: File,
  target: DevelopmentPrivateWorkspaceImportTarget,
  browserCrypto: Pick<Crypto, "randomUUID" | "subtle"> = crypto,
): Promise<
  | { kind: "verified"; value: VerifiedDevelopmentPrivateWorkspaceImportFile }
  | { kind: "rejected"; code: "BUNDLE_BYTES_MISMATCH" | "BUNDLE_SHA256_MISMATCH" | "BUNDLE_TARGET_MISMATCH" | "BROWSER_CRYPTO_UNAVAILABLE" }
> {
  const spec = developmentPrivateWorkspaceImportTargetSpecs[target];
  if (file.size !== spec.bundleBytes) return { kind: "rejected", code: "BUNDLE_BYTES_MISMATCH" };
  try {
    const sha256 = toHex(await browserCrypto.subtle.digest("SHA-256", await file.arrayBuffer()));
    if (sha256 !== spec.bundleSha256) return { kind: "rejected", code: "BUNDLE_SHA256_MISMATCH" };
    const matchingTargets = Object.values(developmentPrivateWorkspaceImportTargetSpecs)
      .filter((candidate) => candidate.bundleBytes === file.size && candidate.bundleSha256 === sha256)
      .map((candidate) => candidate.target);
    if (matchingTargets.length !== 1 || matchingTargets[0] !== target) {
      return { kind: "rejected", code: "BUNDLE_TARGET_MISMATCH" };
    }
    const operationId = browserCrypto.randomUUID().toLowerCase();
    if (!uuidPattern.test(operationId)) return { kind: "rejected", code: "BROWSER_CRYPTO_UNAVAILABLE" };
    return {
      kind: "verified",
      value: { target, file, bytes: file.size, sha256, operationId },
    };
  } catch {
    return { kind: "rejected", code: "BROWSER_CRYPTO_UNAVAILABLE" };
  }
}

export function parseDevelopmentPrivateWorkspaceImportPlanAccess(
  value: unknown,
  target: DevelopmentPrivateWorkspaceImportTarget,
): DevelopmentPrivateWorkspaceImportPlanAccess | null {
  const input = record(value);
  if (
    !input
    || !exactKeys(input, ["environment", "phase", "ready", "schemaVersion", "target"])
    || input.schemaVersion !== 1
    || input.environment !== "development"
    || input.target !== target
    || input.phase !== "plan-access"
    || input.ready !== true
  ) return null;
  return { target, ready: true };
}

export function parseDevelopmentPrivateWorkspaceImportPlan(
  value: unknown,
  target: DevelopmentPrivateWorkspaceImportTarget,
): DevelopmentPrivateWorkspaceImportClientPlan | null {
  const input = record(value);
  const intended = record(input?.intendedMutations);
  const bundle = exactBundle(input?.bundle, target);
  const spec = developmentPrivateWorkspaceImportTargetSpecs[target];
  if (
    !input
    || !intended
    || !bundle
    || !exactKeys(input, [
      "beforeStateSha256",
      "bundle",
      "environment",
      "intendedMutations",
      "phase",
      "planReceipt",
      "schemaVersion",
      "target",
      "writesPerformed",
    ])
    || !exactKeys(intended, [
      "aliases",
      "grants",
      "ownerBinding",
      "privateFileRows",
      "privateGameRows",
      "privateWorkspaceRows",
      "publications",
      "releases",
      "rooms",
      "visibility",
    ])
    || input.schemaVersion !== 1
    || input.environment !== "development"
    || input.target !== target
    || input.phase !== "plan"
    || input.writesPerformed !== 0
    || typeof input.beforeStateSha256 !== "string"
    || !sha256Pattern.test(input.beforeStateSha256)
    || typeof input.planReceipt !== "string"
    || !sha256Pattern.test(input.planReceipt)
    || intended.privateWorkspaceRows !== 1
    || intended.privateGameRows !== spec.gameCount
    || typeof intended.privateFileRows !== "number"
    || !Number.isSafeInteger(intended.privateFileRows)
    || intended.privateFileRows < 1
    || intended.visibility !== "private-quarantined"
    || intended.ownerBinding !== "unbound"
    || intended.grants !== 0
    || intended.releases !== 0
    || intended.publications !== 0
    || intended.aliases !== 0
    || intended.rooms !== 0
  ) return null;
  return {
    target,
    writesPerformed: 0,
    planReceipt: input.planReceipt,
    beforeStateSha256: input.beforeStateSha256,
    privateGameRows: intended.privateGameRows as number,
    privateFileRows: intended.privateFileRows,
    contentSetSha256: bundle.contentSetSha256,
  };
}

function acceptanceFrom(
  value: unknown,
  target: DevelopmentPrivateWorkspaceImportTarget,
  operationId: string,
): DevelopmentPrivateWorkspaceImportAcceptance | null {
  const input = record(value);
  const spec = developmentPrivateWorkspaceImportTargetSpecs[target];
  if (
    !input
    || !exactKeys(input, [
      "aliases",
      "bundleBytes",
      "bundleSha256",
      "contentSetSha256",
      "fileRows",
      "gameIdentitySetSha256",
      "gameRows",
      "grants",
      "ownerBinding",
      "ownerBindingRows",
      "perGameIdentitySha256",
      "private",
      "publications",
      "quarantined",
      "releases",
      "rooms",
      "statusReceipt",
      "visibility",
      "workspaceId",
      "workspaceRows",
    ])
    || input.workspaceId !== operationId
    || input.workspaceRows !== 1
    || input.gameRows !== spec.gameCount
    || typeof input.fileRows !== "number"
    || !Number.isSafeInteger(input.fileRows)
    || input.fileRows < 1
    || input.bundleBytes !== spec.bundleBytes
    || input.bundleSha256 !== spec.bundleSha256
    || input.gameIdentitySetSha256 !== spec.gameIdentitySetSha256
    || input.perGameIdentitySha256 !== spec.perGameIdentitySha256
    || typeof input.contentSetSha256 !== "string"
    || !sha256Pattern.test(input.contentSetSha256)
    || input.visibility !== "private-quarantined"
    || input.private !== true
    || input.quarantined !== true
    || input.ownerBinding !== "unbound"
    || input.ownerBindingRows !== 0
    || input.grants !== 0
    || input.releases !== 0
    || input.publications !== 0
    || input.aliases !== 0
    || input.rooms !== 0
    || (input.statusReceipt !== null
      && (typeof input.statusReceipt !== "string" || !sha256Pattern.test(input.statusReceipt)))
  ) return null;
  return input as DevelopmentPrivateWorkspaceImportAcceptance;
}

export function parseDevelopmentPrivateWorkspaceImportExecute(
  value: unknown,
  target: DevelopmentPrivateWorkspaceImportTarget,
  operationId: string,
): { logicalWrites: 0 | 1; replayed: boolean; acceptance: DevelopmentPrivateWorkspaceImportAcceptance } | null {
  const input = record(value);
  const imported = record(input?.imported);
  const nonEffects = record(input?.nonEffects);
  const bundle = exactBundle(input?.bundle, target);
  const spec = developmentPrivateWorkspaceImportTargetSpecs[target];
  if (
    !input
    || !imported
    || !nonEffects
    || !bundle
    || !exactKeys(input, [
      "bundle",
      "environment",
      "imported",
      "logicalWrites",
      "nonEffects",
      "operationId",
      "ownerBinding",
      "phase",
      "readBackSha256",
      "replayed",
      "schemaVersion",
      "state",
      "target",
      "terminalReceipt",
      "visibility",
    ])
    || !exactKeys(imported, ["fileRows", "gameRows", "workspaceRows"])
    || !exactKeys(nonEffects, [
      "aliases",
      "grants",
      "publications",
      "releases",
      "rooms",
      "sourceWorkspace",
      "unrelatedTarget",
    ])
    || input.schemaVersion !== 1
    || input.environment !== "development"
    || input.target !== target
    || input.phase !== "execute"
    || input.operationId !== operationId
    || input.state !== "completed"
    || input.visibility !== "private-quarantined"
    || input.ownerBinding !== "unbound"
    || input.logicalWrites !== 1
    || input.replayed !== false
    || imported.workspaceRows !== 1
    || imported.gameRows !== spec.gameCount
    || typeof imported.fileRows !== "number"
    || !Number.isSafeInteger(imported.fileRows)
    || imported.fileRows < 1
    || nonEffects.unrelatedTarget !== "byte-for-byte-unchanged"
    || nonEffects.sourceWorkspace !== "row-for-row-unchanged"
    || nonEffects.grants !== 0
    || nonEffects.releases !== 0
    || nonEffects.publications !== 0
    || nonEffects.aliases !== 0
    || nonEffects.rooms !== 0
    || typeof input.readBackSha256 !== "string"
    || !sha256Pattern.test(input.readBackSha256)
    || typeof input.terminalReceipt !== "string"
    || !sha256Pattern.test(input.terminalReceipt)
  ) return null;
  return {
    logicalWrites: input.logicalWrites,
    replayed: input.replayed,
    acceptance: {
      workspaceId: operationId,
      workspaceRows: 1,
      gameRows: imported.gameRows as number,
      fileRows: imported.fileRows,
      bundleBytes: bundle.bytes,
      bundleSha256: bundle.sha256,
      gameIdentitySetSha256: bundle.gameIdentitySetSha256,
      perGameIdentitySha256: bundle.perGameIdentitySha256,
      contentSetSha256: bundle.contentSetSha256,
      visibility: "private-quarantined",
      private: true,
      quarantined: true,
      ownerBinding: "unbound",
      ownerBindingRows: 0,
      grants: 0,
      releases: 0,
      publications: 0,
      aliases: 0,
      rooms: 0,
      statusReceipt: null,
    },
  };
}

export function parseDevelopmentPrivateWorkspaceImportStatus(
  value: unknown,
  target: DevelopmentPrivateWorkspaceImportTarget,
  operationId: string,
): DevelopmentPrivateWorkspaceImportClientStatus | null {
  const input = record(value);
  if (
    !input
    || !exactKeys(input, [
      "acceptance",
      "environment",
      "operationId",
      "phase",
      "schemaVersion",
      "state",
      "target",
    ])
    || input.schemaVersion !== 1
    || input.environment !== "development"
    || input.target !== target
    || input.phase !== "status"
    || input.operationId !== operationId
  ) return null;
  if (input.state === "not-found" && input.acceptance === null) {
    return { state: "not-found", operationId };
  }
  if (input.state !== "completed") return null;
  const acceptance = acceptanceFrom(input.acceptance, target, operationId);
  return acceptance ? { state: "completed", operationId, acceptance } : null;
}
