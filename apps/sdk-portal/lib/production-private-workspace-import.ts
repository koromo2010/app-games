import { createHash } from "node:crypto";
import {
  validateDevelopmentPrivateWorkspaceBundle,
  type DevelopmentPrivateWorkspaceImportFaultPoint,
  type DevelopmentPrivateWorkspaceImportGame,
  type DevelopmentPrivateWorkspaceImportTargetSpec,
} from "./development-private-workspace-import.ts";
import {
  productionPrivateWorkspaceImportEnvironment,
  productionPrivateWorkspaceImportIntent,
  productionPrivateWorkspaceImportRecoveryIdentity,
  productionPrivateWorkspaceImportSchemaVersion,
  productionPrivateWorkspaceImportTargetSpec,
  type ProductionPrivateWorkspaceImportTarget,
} from "./production-private-workspace-import-public-contract.ts";

export {
  isProductionPrivateWorkspaceImportTarget,
  productionPrivateWorkspaceImportEnvironment,
  productionPrivateWorkspaceImportIntent,
  productionPrivateWorkspaceImportRecoveryIdentity,
  productionPrivateWorkspaceImportSchemaVersion,
  productionPrivateWorkspaceImportTarget,
  productionPrivateWorkspaceImportTargetSpec,
  type ProductionPrivateWorkspaceImportTarget,
} from "./production-private-workspace-import-public-contract.ts";

const sha256Pattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumArchiveBytes = 1_048_576;

export type ValidatedProductionPrivateWorkspaceBundle = {
  target: ProductionPrivateWorkspaceImportTarget;
  environment: "production";
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

export type ProductionPrivateWorkspaceImportBeforeState = {
  targetCreatorRowId: string;
  targetCreatorRows: number;
  targetDeletedCreatorRows: number;
  targetCreatorOwnerRows: number;
  targetGameRows: number;
  targetDeletedGameRows: number;
  targetActiveGameRows: number;
  targetReleaseRows: number;
  targetCurrentReleaseRows: number;
  recoveryOperationRows: number;
  recoveryQuarantineGameRows: number;
  recoveryIdentityExact: boolean;
  targetWorkspaceRows: number;
  targetWorkspaceGameRows: number;
  targetWorkspaceFileRows: number;
  sourceStateToken: string;
  publicStateToken: string;
  unrelatedPrivateStateToken: string;
};

export type ProductionPrivateWorkspaceImportReadBack = {
  targetWorkspaceRows: 1;
  targetWorkspaceGameRows: number;
  targetWorkspaceFileRows: number;
  bundleSha256: string;
  workspaceManifestSha256: string;
  perGameLedgerSha256: string;
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

export type CompletedProductionPrivateWorkspaceImport = {
  target: ProductionPrivateWorkspaceImportTarget;
  operationId: string;
  planReceipt: string;
  bundleSha256: string;
  readBack: ProductionPrivateWorkspaceImportReadBack;
};

export type ProductionPrivateWorkspaceImportAdapter = {
  readBeforeState(target: ProductionPrivateWorkspaceImportTarget): Promise<ProductionPrivateWorkspaceImportBeforeState>;
  readCompletedOperation(operationId: string): Promise<CompletedProductionPrivateWorkspaceImport | null>;
  importAtomic(input: {
    bundle: ValidatedProductionPrivateWorkspaceBundle;
    beforeState: ProductionPrivateWorkspaceImportBeforeState;
    beforeStateSha256: string;
    operationId: string;
    planReceipt: string;
    terminalReceipt: string;
    readBackSha256: string;
    expectedReadBack: ProductionPrivateWorkspaceImportReadBack;
    faultAt?: DevelopmentPrivateWorkspaceImportFaultPoint;
  }): Promise<{ replayed: boolean; readBack: ProductionPrivateWorkspaceImportReadBack }>;
};

export class ProductionPrivateWorkspaceImportError extends Error {
  readonly code:
    | "PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID"
    | "PRODUCTION_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH"
    | "PRODUCTION_PRIVATE_IMPORT_CONTENT_INVALID"
    | "PRODUCTION_PRIVATE_IMPORT_INVARIANT_UNRESOLVED"
    | "PRODUCTION_PRIVATE_IMPORT_PLAN_RECEIPT_MISMATCH"
    | "PRODUCTION_PRIVATE_IMPORT_OPERATION_CONFLICT"
    | "PRODUCTION_PRIVATE_IMPORT_CONCURRENT_CHANGE"
    | "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE";

  constructor(code: ProductionPrivateWorkspaceImportError["code"]) {
    super(code);
    this.code = code;
    this.name = "ProductionPrivateWorkspaceImportError";
  }
}

function fail(code: ProductionPrivateWorkspaceImportError["code"]): never {
  throw new ProductionPrivateWorkspaceImportError(code);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const input = value as Record<string, unknown>;
  return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(input[key])}`).join(",")}}`;
}

function digest(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function productionPrivateWorkspaceCreatorIdentitySha256(creatorRowId: string) {
  return createHash("sha256").update(`production-private-workspace:${creatorRowId}`).digest("hex");
}

function uuidFromSha256(value: string) {
  const chars = value.slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = "8";
  const compact = chars.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

export function productionPrivateWorkspaceOperationId(
  bundle: Pick<ValidatedProductionPrivateWorkspaceBundle,
    "target" | "bundleSha256" | "workspaceManifestSha256" | "perGameLedgerSha256" | "creatorRowId">,
) {
  const identity = [
    productionPrivateWorkspaceImportIntent,
    bundle.target,
    bundle.bundleSha256,
    bundle.workspaceManifestSha256,
    bundle.perGameLedgerSha256,
    productionPrivateWorkspaceCreatorIdentitySha256(bundle.creatorRowId),
  ].join("|");
  return uuidFromSha256(createHash("sha256").update(identity).digest("hex"));
}

export function validateProductionPrivateWorkspaceBundle(input: {
  target: ProductionPrivateWorkspaceImportTarget;
  archive: Uint8Array;
  specs?: Readonly<Record<"moi-lab2" | "yabobojpn-lab", DevelopmentPrivateWorkspaceImportTargetSpec>>;
}): ValidatedProductionPrivateWorkspaceBundle {
  try {
    const validated = validateDevelopmentPrivateWorkspaceBundle({
      target: input.target,
      archive: input.archive,
      ...(input.specs ? { specs: input.specs } : {}),
    });
    return {
      ...validated,
      target: input.target,
      environment: productionPrivateWorkspaceImportEnvironment,
    };
  } catch {
    fail("PRODUCTION_PRIVATE_IMPORT_CONTENT_INVALID");
  }
}

function exactBeforeState(
  state: ProductionPrivateWorkspaceImportBeforeState,
  bundle: ValidatedProductionPrivateWorkspaceBundle,
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
    || state.recoveryOperationRows !== 1
    || state.recoveryQuarantineGameRows !== bundle.gameCount
    || state.recoveryIdentityExact !== true
    || state.targetWorkspaceRows !== 0
    || state.targetWorkspaceGameRows !== 0
    || state.targetWorkspaceFileRows !== 0
    || !sha256Pattern.test(state.sourceStateToken)
    || !sha256Pattern.test(state.publicStateToken)
    || !sha256Pattern.test(state.unrelatedPrivateStateToken)
  ) fail("PRODUCTION_PRIVATE_IMPORT_INVARIANT_UNRESOLVED");
}

export function projectProductionPrivateWorkspaceImportTargetState(
  target: ProductionPrivateWorkspaceImportTarget,
  state: ProductionPrivateWorkspaceImportBeforeState,
) {
  const identity = state.targetCreatorRowId
    ? productionPrivateWorkspaceCreatorIdentitySha256(state.targetCreatorRowId)
    : null;
  const counts = {
    creatorRows: state.targetCreatorRows,
    deletedCreatorRows: state.targetDeletedCreatorRows,
    creatorOwnerRows: state.targetCreatorOwnerRows,
    gameRows: state.targetGameRows,
    deletedGameRows: state.targetDeletedGameRows,
    activeGameRows: state.targetActiveGameRows,
    releaseRows: state.targetReleaseRows,
    currentReleaseRows: state.targetCurrentReleaseRows,
    recoveryOperationRows: state.recoveryOperationRows,
    recoveryQuarantineGameRows: state.recoveryQuarantineGameRows,
    workspaceRows: state.targetWorkspaceRows,
    workspaceGameRows: state.targetWorkspaceGameRows,
    workspaceFileRows: state.targetWorkspaceFileRows,
  };
  const integrity = {
    creatorIdentitySha256: identity,
    recoveryIdentityExact: state.recoveryIdentityExact,
    sourceStateTokenValid: sha256Pattern.test(state.sourceStateToken),
    publicStateTokenValid: sha256Pattern.test(state.publicStateToken),
    unrelatedPrivateStateTokenValid: sha256Pattern.test(state.unrelatedPrivateStateToken),
  };
  const ready = identity !== null
    && integrity.recoveryIdentityExact
    && integrity.sourceStateTokenValid
    && integrity.publicStateTokenValid
    && integrity.unrelatedPrivateStateTokenValid
    && counts.creatorRows === 1
    && counts.deletedCreatorRows === 1
    && counts.creatorOwnerRows === 0
    && counts.gameRows === productionPrivateWorkspaceImportTargetSpec.gameCount
    && counts.deletedGameRows === productionPrivateWorkspaceImportTargetSpec.gameCount
    && counts.activeGameRows === 0
    && counts.releaseRows === 0
    && counts.currentReleaseRows === 0
    && counts.recoveryOperationRows === 1
    && counts.recoveryQuarantineGameRows === productionPrivateWorkspaceImportTargetSpec.gameCount
    && counts.workspaceRows === 0
    && counts.workspaceGameRows === 0
    && counts.workspaceFileRows === 0;
  return {
    schemaVersion: 1 as const,
    environment: productionPrivateWorkspaceImportEnvironment,
    target,
    phase: "target-state" as const,
    ready,
    counts,
    integrity,
    recoveryIdentity: productionPrivateWorkspaceImportRecoveryIdentity,
    expectedState: {
      visibility: "private-quarantined" as const,
      private: true as const,
      quarantined: true as const,
      ownerBinding: "unbound" as const,
      grants: 0 as const,
      releases: 0 as const,
      publications: 0 as const,
      aliases: 0 as const,
      rooms: 0 as const,
    },
  };
}

function planFrom(
  bundle: ValidatedProductionPrivateWorkspaceBundle,
  state: ProductionPrivateWorkspaceImportBeforeState,
) {
  exactBeforeState(state, bundle);
  const beforeStateSha256 = digest(state);
  const bundleReceipt = {
    bytes: bundle.bundleBytes,
    sha256: bundle.bundleSha256,
    schemaVersion: bundle.schemaVersion,
    gameCount: bundle.gameCount,
    entryCount: bundle.entryCount,
    runtimeFileCount: bundle.runtimeFileCount,
    workspaceManifestSha256: bundle.workspaceManifestSha256,
    perGameLedgerSha256: bundle.perGameLedgerSha256,
    gameIdentitySetSha256: bundle.gameIdentitySetSha256,
    perGameIdentitySha256: bundle.perGameIdentitySha256,
    contentSetSha256: bundle.contentSetSha256,
  } as const;
  const intendedMutations = {
    privateWorkspaceRows: 1 as const,
    privateGameRows: bundle.gameCount,
    privateFileRows: bundle.runtimeFileCount,
    visibility: "private-quarantined" as const,
    ownerBinding: "unbound" as const,
    grants: 0 as const,
    releases: 0 as const,
    publications: 0 as const,
    aliases: 0 as const,
    rooms: 0 as const,
  };
  const planReceipt = digest({
    schemaVersion: productionPrivateWorkspaceImportSchemaVersion,
    environment: productionPrivateWorkspaceImportEnvironment,
    target: bundle.target,
    intent: productionPrivateWorkspaceImportIntent,
    recoveryIdentity: productionPrivateWorkspaceImportRecoveryIdentity,
    bundle: bundleReceipt,
    intendedMutations,
    beforeStateSha256,
  });
  return {
    schemaVersion: 1 as const,
    environment: productionPrivateWorkspaceImportEnvironment,
    target: bundle.target,
    phase: "plan" as const,
    writesPerformed: 0 as const,
    bundle: bundleReceipt,
    recoveryIdentity: productionPrivateWorkspaceImportRecoveryIdentity,
    intendedMutations,
    beforeStateSha256,
    planReceipt,
  };
}

export async function prepareProductionPrivateWorkspaceImportPlan(input: {
  target: ProductionPrivateWorkspaceImportTarget;
  archive: Uint8Array;
  adapter: ProductionPrivateWorkspaceImportAdapter;
  specs?: Readonly<Record<"moi-lab2" | "yabobojpn-lab", DevelopmentPrivateWorkspaceImportTargetSpec>>;
}) {
  const bundle = validateProductionPrivateWorkspaceBundle(input);
  const beforeState = await input.adapter.readBeforeState(input.target);
  return { bundle, beforeState, response: planFrom(bundle, beforeState) };
}

function parseExecuteIdentity(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).sort().join(",") !== "operationId,planReceipt"
    || typeof input.operationId !== "string"
    || !uuidPattern.test(input.operationId)
    || typeof input.planReceipt !== "string"
    || !sha256Pattern.test(input.planReceipt)
  ) fail("PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID");
  return { operationId: input.operationId.toLowerCase(), planReceipt: input.planReceipt };
}

function expectedReadBack(
  bundle: ValidatedProductionPrivateWorkspaceBundle,
  before: ProductionPrivateWorkspaceImportBeforeState,
): ProductionPrivateWorkspaceImportReadBack {
  return {
    targetWorkspaceRows: 1,
    targetWorkspaceGameRows: bundle.gameCount,
    targetWorkspaceFileRows: bundle.runtimeFileCount,
    bundleSha256: bundle.bundleSha256,
    workspaceManifestSha256: bundle.workspaceManifestSha256,
    perGameLedgerSha256: bundle.perGameLedgerSha256,
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

function assertReadBack(
  expected: ProductionPrivateWorkspaceImportReadBack,
  actual: ProductionPrivateWorkspaceImportReadBack,
) {
  if (canonicalJson(expected) !== canonicalJson(actual)) {
    fail("PRODUCTION_PRIVATE_IMPORT_CONCURRENT_CHANGE");
  }
}

function terminalFrom(input: {
  bundle: ValidatedProductionPrivateWorkspaceBundle;
  operationId: string;
  planReceipt: string;
  replayed: boolean;
  readBack: ProductionPrivateWorkspaceImportReadBack;
}) {
  const readBackSha256 = digest(input.readBack);
  const terminalReceipt = digest({
    schemaVersion: 1,
    environment: productionPrivateWorkspaceImportEnvironment,
    target: input.bundle.target,
    intent: productionPrivateWorkspaceImportIntent,
    operationId: input.operationId,
    planReceipt: input.planReceipt,
    bundleSha256: input.bundle.bundleSha256,
    workspaceManifestSha256: input.bundle.workspaceManifestSha256,
    readBackSha256,
    state: "completed",
  });
  return {
    schemaVersion: 1 as const,
    environment: productionPrivateWorkspaceImportEnvironment,
    target: input.bundle.target,
    phase: "execute" as const,
    operationId: input.operationId,
    state: "completed" as const,
    visibility: "private-quarantined" as const,
    private: true as const,
    quarantined: true as const,
    ownerBinding: "unbound" as const,
    logicalWrites: (input.replayed ? 0 : 1) as 0 | 1,
    replayed: input.replayed,
    imported: {
      workspaceRows: 1 as const,
      gameRows: input.readBack.targetWorkspaceGameRows,
      fileRows: input.readBack.targetWorkspaceFileRows,
    },
    nonEffects: {
      grants: 0 as const,
      releases: 0 as const,
      publications: 0 as const,
      aliases: 0 as const,
      rooms: 0 as const,
      publicExposure: 0 as const,
    },
    readBackSha256,
    terminalReceipt,
  };
}

export async function executeProductionPrivateWorkspaceImport(input: {
  target: ProductionPrivateWorkspaceImportTarget;
  archive: Uint8Array;
  identity: unknown;
  adapter: ProductionPrivateWorkspaceImportAdapter;
  specs?: Readonly<Record<"moi-lab2" | "yabobojpn-lab", DevelopmentPrivateWorkspaceImportTargetSpec>>;
  faultAt?: DevelopmentPrivateWorkspaceImportFaultPoint;
}) {
  const identity = parseExecuteIdentity(input.identity);
  const bundle = validateProductionPrivateWorkspaceBundle(input);
  if (identity.operationId !== productionPrivateWorkspaceOperationId(bundle)) {
    fail("PRODUCTION_PRIVATE_IMPORT_OPERATION_CONFLICT");
  }
  const completed = await input.adapter.readCompletedOperation(identity.operationId);
  if (completed) fail("PRODUCTION_PRIVATE_IMPORT_OPERATION_CONFLICT");
  const beforeState = await input.adapter.readBeforeState(input.target);
  const plan = planFrom(bundle, beforeState);
  if (plan.planReceipt !== identity.planReceipt) fail("PRODUCTION_PRIVATE_IMPORT_PLAN_RECEIPT_MISMATCH");
  const expected = expectedReadBack(bundle, beforeState);
  const terminal = terminalFrom({ bundle, ...identity, replayed: false, readBack: expected });
  const result = await input.adapter.importAtomic({
    bundle,
    beforeState,
    beforeStateSha256: plan.beforeStateSha256,
    operationId: identity.operationId,
    planReceipt: identity.planReceipt,
    terminalReceipt: terminal.terminalReceipt,
    readBackSha256: terminal.readBackSha256,
    expectedReadBack: expected,
    ...(input.faultAt ? { faultAt: input.faultAt } : {}),
  });
  if (result.replayed) fail("PRODUCTION_PRIVATE_IMPORT_OPERATION_CONFLICT");
  assertReadBack(expected, result.readBack);
  return terminalFrom({ bundle, ...identity, replayed: false, readBack: result.readBack });
}

export async function readProductionPrivateWorkspaceImportStatus(input: {
  target: ProductionPrivateWorkspaceImportTarget;
  identity: unknown;
  adapter: Pick<ProductionPrivateWorkspaceImportAdapter, "readBeforeState" | "readCompletedOperation">;
  specs?: Readonly<Record<"moi-lab2" | "yabobojpn-lab", DevelopmentPrivateWorkspaceImportTargetSpec>>;
}) {
  const spec = input.specs?.[input.target] ?? productionPrivateWorkspaceImportTargetSpec;
  if (!input.identity || typeof input.identity !== "object" || Array.isArray(input.identity)) {
    fail("PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID");
  }
  const identity = input.identity as Record<string, unknown>;
  if (
    Object.keys(identity).sort().join(",") !== "bundleSha256,operationId,planReceipt"
    || typeof identity.operationId !== "string"
    || !uuidPattern.test(identity.operationId)
    || typeof identity.planReceipt !== "string"
    || !sha256Pattern.test(identity.planReceipt)
    || identity.bundleSha256 !== spec.bundleSha256
  ) fail("PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID");
  const operationId = identity.operationId.toLowerCase();
  const completed = await input.adapter.readCompletedOperation(operationId);
  if (!completed) return {
    schemaVersion: 1 as const,
    environment: productionPrivateWorkspaceImportEnvironment,
    target: input.target,
    phase: "status" as const,
    operationId,
    state: "not-found" as const,
    acceptance: null,
  };
  if (
    completed.target !== input.target
    || completed.operationId !== operationId
    || completed.planReceipt !== identity.planReceipt
    || completed.bundleSha256 !== identity.bundleSha256
  ) fail("PRODUCTION_PRIVATE_IMPORT_OPERATION_CONFLICT");
  const readBack = completed.readBack;
  const current = await input.adapter.readBeforeState(input.target);
  if (
    readBack.targetWorkspaceRows !== 1
    || readBack.targetWorkspaceGameRows !== spec.gameCount
    || readBack.targetWorkspaceFileRows < 1
    || readBack.bundleSha256 !== spec.bundleSha256
    || readBack.gameIdentitySetSha256 !== spec.gameIdentitySetSha256
    || readBack.perGameIdentitySha256 !== spec.perGameIdentitySha256
    || !sha256Pattern.test(readBack.workspaceManifestSha256)
    || !sha256Pattern.test(readBack.perGameLedgerSha256)
    || readBack.ownerBindingRows !== 0
    || readBack.grantRows !== 0
    || readBack.releaseRows !== 0
    || readBack.publicationRows !== 0
    || readBack.aliasRows !== 0
    || readBack.roomRows !== 0
    || current.targetCreatorRows !== 1
    || current.targetDeletedCreatorRows !== 1
    || current.targetCreatorOwnerRows !== 0
    || current.targetGameRows !== spec.gameCount
    || current.targetDeletedGameRows !== spec.gameCount
    || current.targetActiveGameRows !== 0
    || current.targetReleaseRows !== 0
    || current.targetCurrentReleaseRows !== 0
    || current.recoveryOperationRows !== 1
    || current.recoveryQuarantineGameRows !== spec.gameCount
    || current.recoveryIdentityExact !== true
    || current.targetWorkspaceRows !== 1
    || current.targetWorkspaceGameRows !== readBack.targetWorkspaceGameRows
    || current.targetWorkspaceFileRows !== readBack.targetWorkspaceFileRows
    || current.sourceStateToken !== readBack.sourceStateToken
    || current.publicStateToken !== readBack.publicStateToken
    || current.unrelatedPrivateStateToken !== readBack.unrelatedPrivateStateToken
  ) fail("PRODUCTION_PRIVATE_IMPORT_CONCURRENT_CHANGE");
  const acceptance = {
    workspaceId: operationId,
    workspaceRows: 1 as const,
    gameRows: readBack.targetWorkspaceGameRows,
    fileRows: readBack.targetWorkspaceFileRows,
    bundleBytes: spec.bundleBytes,
    bundleSha256: readBack.bundleSha256,
    workspaceManifestSha256: readBack.workspaceManifestSha256,
    perGameLedgerSha256: readBack.perGameLedgerSha256,
    gameIdentitySetSha256: readBack.gameIdentitySetSha256,
    perGameIdentitySha256: readBack.perGameIdentitySha256,
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
    publicExposure: 0 as const,
  };
  return {
    schemaVersion: 1 as const,
    environment: productionPrivateWorkspaceImportEnvironment,
    target: input.target,
    phase: "status" as const,
    operationId,
    state: "completed" as const,
    acceptance: {
      ...acceptance,
      statusReceipt: digest({
        schemaVersion: 1,
        environment: productionPrivateWorkspaceImportEnvironment,
        target: input.target,
        operationId,
        planReceipt: identity.planReceipt,
        acceptance,
      }),
    },
  };
}

export async function readProductionPrivateWorkspaceImportBody(
  request: Request,
  target: ProductionPrivateWorkspaceImportTarget,
) {
  if (request.headers.get("content-type") !== "application/zip") fail("PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID");
  const expected = productionPrivateWorkspaceImportTargetSpec.bundleBytes;
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) !== expected) fail("PRODUCTION_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH");
  if (!request.body) fail("PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumArchiveBytes || bytes > expected) {
      await reader.cancel();
      fail("PRODUCTION_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH");
    }
    chunks.push(Buffer.from(value));
  }
  if (bytes !== expected || target !== productionPrivateWorkspaceImportTargetSpec.target) {
    fail("PRODUCTION_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH");
  }
  return Buffer.concat(chunks);
}

export function productionPrivateWorkspaceImportErrorStatus(error: unknown) {
  if (!(error instanceof ProductionPrivateWorkspaceImportError)) return 503;
  if (
    error.code === "PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID"
    || error.code === "PRODUCTION_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH"
    || error.code === "PRODUCTION_PRIVATE_IMPORT_CONTENT_INVALID"
  ) return 400;
  if (error.code === "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE") return 503;
  return 409;
}
