import { createHash } from "node:crypto";

export const rowQuarantineOnlyMode = "ROW_QUARANTINE_ONLY";
export const artifactReconstructionBlocked = "ARTIFACT_RECONSTRUCTION_BLOCKED";
export const creatorQuarantineRecoveryIntent = "bounded-quarantine-reconstruction-v1";

export const creatorRowQuarantineTargets = [
  "moi-lab2",
  "yabobojpn-lab",
] as const;

export type CreatorRowQuarantineTarget = (typeof creatorRowQuarantineTargets)[number];
export type CreatorRecoveryEnvironment = "production";

export type CreatorRecoverySnapshot = {
  creatorRows: number;
  deletedCreatorRows: number;
  ownerBoundRows: number;
  tombstonedGameRows: number;
  activeGameRows: number;
  packageRevisionRows: number;
  releaseRows: number;
  currentReleaseRows: number;
  dbVersionToken: string;
};

export type CreatorRecoveryPlan = {
  schemaVersion: 2;
  environment: CreatorRecoveryEnvironment;
  mode: typeof rowQuarantineOnlyMode;
  dryRun: true;
  writesPerformed: 0;
  planReceipt: string;
  artifactRecovery: typeof artifactReconstructionBlocked;
  nextStageRequiresSeparateAuthorization: true;
};

export type PreparedCreatorRecoveryPlan = {
  response: CreatorRecoveryPlan;
  concurrencyToken: string;
};

export type CreatorRecoveryTerminalReceipt = {
  schemaVersion: 2;
  environment: CreatorRecoveryEnvironment;
  mode: typeof rowQuarantineOnlyMode;
  operationId: string;
  state: "quarantined";
  visibility: "non-public";
  ownerBinding: "unbound";
  grantState: "absent";
  releaseState: "blocked";
  publication: "blocked";
  terminalReceipt: string;
  replayed: boolean;
  logicalRecoveryWrites: 0 | 1;
  artifactRecovery: typeof artifactReconstructionBlocked;
  nextStageRequiresSeparateAuthorization: true;
};

export type CreatorRecoveryFaultPoint =
  | "before-ledger"
  | "after-ledger"
  | "after-quarantine-items"
  | "before-terminal";

export type CreatorRecoveryRequest = {
  operationId: string;
  planReceipt: string;
};

export class CreatorRecoveryError extends Error {
  readonly code:
    | "CREATOR_RECOVERY_INPUT_INVALID"
    | "CREATOR_RECOVERY_PRECONDITION_FAILED"
    | "CREATOR_RECOVERY_PLAN_RECEIPT_MISMATCH"
    | "CREATOR_RECOVERY_OPERATION_CONFLICT"
    | "CREATOR_RECOVERY_CONCURRENT_CHANGE"
    | "CREATOR_RECOVERY_ARTIFACT_RECONSTRUCTION_BLOCKED"
    | "CREATOR_RECOVERY_UNAVAILABLE";

  readonly diagnostic: { phase: string; store: string };

  constructor(
    code: CreatorRecoveryError["code"],
    diagnostic: { phase: string; store: string } = {
      phase: "request-validation",
      store: "request",
    },
  ) {
    super(code);
    this.code = code;
    this.diagnostic = diagnostic;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const receiptPattern = /^[0-9a-f]{64}$/;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  )).join(",")}}`;
}

function digest(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function isCreatorRowQuarantineTarget(value: string): value is CreatorRowQuarantineTarget {
  return (creatorRowQuarantineTargets as readonly string[]).includes(value);
}

export function parseCreatorRecoveryWriteRequest(value: unknown): CreatorRecoveryRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CreatorRecoveryError("CREATOR_RECOVERY_INPUT_INVALID");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "operationId" && key !== "planReceipt")) {
    throw new CreatorRecoveryError("CREATOR_RECOVERY_INPUT_INVALID");
  }
  if (typeof input.operationId !== "string" || !uuidPattern.test(input.operationId)
    || typeof input.planReceipt !== "string" || !receiptPattern.test(input.planReceipt)) {
    throw new CreatorRecoveryError("CREATOR_RECOVERY_INPUT_INVALID");
  }
  return { operationId: input.operationId.toLowerCase(), planReceipt: input.planReceipt };
}

export function assertCreatorRecoveryPreconditions(snapshot: CreatorRecoverySnapshot) {
  const valid = snapshot.creatorRows === 1
    && snapshot.deletedCreatorRows === 1
    && snapshot.ownerBoundRows === 0
    && snapshot.tombstonedGameRows >= 0
    && snapshot.activeGameRows === 0
    && snapshot.packageRevisionRows >= 0
    && snapshot.releaseRows === 0
    && snapshot.currentReleaseRows === 0
    && receiptPattern.test(snapshot.dbVersionToken);
  if (!valid) {
    throw new CreatorRecoveryError("CREATOR_RECOVERY_PRECONDITION_FAILED", {
      phase: "dry-run-planning",
      store: "sdk-postgres",
    });
  }
}

export function createCreatorRecoveryPlan(
  target: CreatorRowQuarantineTarget,
  environment: CreatorRecoveryEnvironment,
  snapshot: CreatorRecoverySnapshot,
): PreparedCreatorRecoveryPlan {
  assertCreatorRecoveryPreconditions(snapshot);
  const planReceipt = digest({ schemaVersion: 2, target, environment, mode: rowQuarantineOnlyMode, snapshot });
  return {
    concurrencyToken: snapshot.dbVersionToken,
    response: {
      schemaVersion: 2,
      environment,
      mode: rowQuarantineOnlyMode,
      dryRun: true,
      writesPerformed: 0,
      planReceipt,
      artifactRecovery: artifactReconstructionBlocked,
      nextStageRequiresSeparateAuthorization: true,
    },
  };
}

export function createCreatorRecoveryTerminalReceipt(input: {
  target: CreatorRowQuarantineTarget;
  environment: CreatorRecoveryEnvironment;
  operationId: string;
  planReceipt: string;
  replayed: boolean;
}): CreatorRecoveryTerminalReceipt {
  const terminalReceipt = digest({
    schemaVersion: 2,
    target: input.target,
    environment: input.environment,
    mode: rowQuarantineOnlyMode,
    operationId: input.operationId,
    planReceipt: input.planReceipt,
    state: "quarantined",
  });
  return {
    schemaVersion: 2,
    environment: input.environment,
    mode: rowQuarantineOnlyMode,
    operationId: input.operationId,
    state: "quarantined",
    visibility: "non-public",
    ownerBinding: "unbound",
    grantState: "absent",
    releaseState: "blocked",
    publication: "blocked",
    terminalReceipt,
    replayed: input.replayed,
    logicalRecoveryWrites: input.replayed ? 0 : 1,
    artifactRecovery: artifactReconstructionBlocked,
    nextStageRequiresSeparateAuthorization: true,
  };
}

type CreatorRecoveryAdapter = {
  readPlan: () => Promise<PreparedCreatorRecoveryPlan>;
  quarantine: (input: {
    operationId: string;
    planReceipt: string;
    concurrencyToken: string;
    faultAt?: CreatorRecoveryFaultPoint;
  }) => Promise<CreatorRecoveryTerminalReceipt>;
};

export async function processCreatorRecoveryDryRun(adapter: CreatorRecoveryAdapter) {
  return (await adapter.readPlan()).response;
}

export async function processCreatorRecoveryWrite(
  value: unknown,
  adapter: CreatorRecoveryAdapter,
  options: { faultAt?: CreatorRecoveryFaultPoint } = {},
) {
  const request = parseCreatorRecoveryWriteRequest(value);
  const prepared = await adapter.readPlan();
  if (request.planReceipt !== prepared.response.planReceipt) {
    throw new CreatorRecoveryError("CREATOR_RECOVERY_PLAN_RECEIPT_MISMATCH", {
      phase: "receipt-verification",
      store: "request",
    });
  }
  return adapter.quarantine({
    operationId: request.operationId,
    planReceipt: request.planReceipt,
    concurrencyToken: prepared.concurrencyToken,
    faultAt: options.faultAt,
  });
}

export function rejectArtifactBackedReconstruction(): never {
  throw new CreatorRecoveryError("CREATOR_RECOVERY_ARTIFACT_RECONSTRUCTION_BLOCKED", {
    phase: "artifact-reconstruction",
    store: "git-artifacts",
  });
}

export function creatorRecoveryErrorStatus(error: unknown) {
  if (!(error instanceof CreatorRecoveryError)) return 503;
  if (error.code === "CREATOR_RECOVERY_INPUT_INVALID") return 400;
  if (error.code === "CREATOR_RECOVERY_ARTIFACT_RECONSTRUCTION_BLOCKED") return 409;
  if (error.code === "CREATOR_RECOVERY_UNAVAILABLE") return 503;
  return 409;
}
