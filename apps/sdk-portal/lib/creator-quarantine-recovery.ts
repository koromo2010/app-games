import { createHash } from "node:crypto";

export const creatorQuarantineRecoveryTarget = "moi-lab2";
export const creatorQuarantineRecoveryIntent = "bounded-quarantine-reconstruction-v1";

export type CreatorRecoveryEnvironment = "production" | "development";

export type CreatorRecoveryCounts = {
  creatorRows: number;
  tombstonedGameRows: number;
  activeGameRows: number;
  packageRevisionRows: number;
  artifactLocators: number;
  artifactsPresent: number;
  releaseRows: number;
  currentReleaseRows: number;
  activeCreatorCollisions: number;
};

export type CreatorRecoverySnapshot = {
  creatorLifecycle: "deleted" | "active" | "missing";
  ownerAuthority: "none" | "bound";
  counts: CreatorRecoveryCounts;
  artifactStatus: "COMPLETE" | "NO_LOCATORS" | "PARTIAL" | "BOUNDED_OUT";
  dbVersionToken: string;
};

export type CreatorRecoveryPlan = {
  schemaVersion: 1;
  environment: CreatorRecoveryEnvironment;
  scope: "exact-target";
  intent: typeof creatorQuarantineRecoveryIntent;
  target: {
    slug: typeof creatorQuarantineRecoveryTarget;
    lifecycle: "deleted";
    ownerAuthority: "none";
  };
  dryRun: true;
  writesPerformed: 0;
  counts: CreatorRecoveryCounts;
  artifactStatus: "COMPLETE";
  planReceipt: string;
  stages: readonly [
    "dry-run",
    "quarantine-reconstruction",
    "verified-owner-binding",
    "user-confirmed-publication",
  ];
  nextStageRequiresSeparateAuthorization: true;
};

export type PreparedCreatorRecoveryPlan = {
  response: CreatorRecoveryPlan;
  concurrencyToken: string;
};

export type CreatorRecoveryTerminalReceipt = {
  schemaVersion: 1;
  environment: CreatorRecoveryEnvironment;
  scope: "exact-target";
  intent: typeof creatorQuarantineRecoveryIntent;
  target: { slug: typeof creatorQuarantineRecoveryTarget };
  operationId: string;
  state: "quarantined";
  visibility: "non-public";
  ownerBinding: "unbound";
  publication: "blocked";
  terminalReceipt: string;
  replayed: boolean;
  logicalRecoveryWrites: 0 | 1;
  counts: Pick<
    CreatorRecoveryCounts,
    "tombstonedGameRows" | "packageRevisionRows" | "artifactLocators" | "releaseRows"
  >;
  nextStageRequiresSeparateAuthorization: true;
};

export type CreatorRecoveryFaultPoint =
  | "before-ledger"
  | "after-ledger"
  | "after-quarantine-items"
  | "before-terminal";

export type CreatorRecoveryDiagnosticPhase =
  | "request-validation"
  | "dry-run-planning"
  | "receipt-verification"
  | "quarantine-ledger"
  | "quarantine-transaction"
  | "terminal-receipt"
  | "request-processing";

export type CreatorRecoveryDiagnosticStore =
  | "request"
  | "sdk-postgres"
  | "git-artifacts"
  | "recovery-ledger"
  | "sdk-portal";

export type CreatorRecoveryRequest = {
  slug: typeof creatorQuarantineRecoveryTarget;
  dryRun: boolean;
  operationId?: string;
  planReceipt?: string;
};

export class CreatorRecoveryError extends Error {
  readonly code:
    | "CREATOR_RECOVERY_INPUT_INVALID"
    | "CREATOR_RECOVERY_PRECONDITION_FAILED"
    | "CREATOR_RECOVERY_PLAN_RECEIPT_MISMATCH"
    | "CREATOR_RECOVERY_OPERATION_CONFLICT"
    | "CREATOR_RECOVERY_CONCURRENT_CHANGE"
    | "CREATOR_RECOVERY_UNAVAILABLE";
  readonly diagnostic: {
    phase: CreatorRecoveryDiagnosticPhase;
    store: CreatorRecoveryDiagnosticStore;
  };

  constructor(
    code:
      | "CREATOR_RECOVERY_INPUT_INVALID"
      | "CREATOR_RECOVERY_PRECONDITION_FAILED"
      | "CREATOR_RECOVERY_PLAN_RECEIPT_MISMATCH"
      | "CREATOR_RECOVERY_OPERATION_CONFLICT"
      | "CREATOR_RECOVERY_CONCURRENT_CHANGE"
      | "CREATOR_RECOVERY_UNAVAILABLE",
    diagnostic: {
      phase: CreatorRecoveryDiagnosticPhase;
      store: CreatorRecoveryDiagnosticStore;
    } = { phase: "request-validation", store: "request" },
    message: string = code,
  ) {
    super(message);
    this.code = code;
    this.diagnostic = diagnostic;
  }
}

type CreatorRecoveryAdapter = {
  readPlan: () => Promise<PreparedCreatorRecoveryPlan>;
  quarantine: (input: {
    operationId: string;
    planReceipt: string;
    terminalReceipt: string;
    concurrencyToken: string;
    faultAt?: CreatorRecoveryFaultPoint;
  }) => Promise<CreatorRecoveryTerminalReceipt>;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function digest(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const receiptPattern = /^[0-9a-f]{64}$/;

export function parseCreatorRecoveryRequest(value: unknown): CreatorRecoveryRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CreatorRecoveryError("CREATOR_RECOVERY_INPUT_INVALID");
  }
  const input = value as Record<string, unknown>;
  const allowed = new Set(["slug", "dryRun", "operationId", "planReceipt"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new CreatorRecoveryError("CREATOR_RECOVERY_INPUT_INVALID");
  }
  if (input.slug !== creatorQuarantineRecoveryTarget) {
    throw new CreatorRecoveryError("CREATOR_RECOVERY_INPUT_INVALID");
  }
  const dryRun = input.dryRun === undefined ? true : input.dryRun;
  if (typeof dryRun !== "boolean") {
    throw new CreatorRecoveryError("CREATOR_RECOVERY_INPUT_INVALID");
  }
  if (dryRun) {
    if (input.operationId !== undefined || input.planReceipt !== undefined) {
      throw new CreatorRecoveryError("CREATOR_RECOVERY_INPUT_INVALID");
    }
    return { slug: creatorQuarantineRecoveryTarget, dryRun: true };
  }
  if (
    typeof input.operationId !== "string"
    || !uuidPattern.test(input.operationId)
    || typeof input.planReceipt !== "string"
    || !receiptPattern.test(input.planReceipt)
  ) {
    throw new CreatorRecoveryError("CREATOR_RECOVERY_INPUT_INVALID");
  }
  return {
    slug: creatorQuarantineRecoveryTarget,
    dryRun: false,
    operationId: input.operationId.toLowerCase(),
    planReceipt: input.planReceipt,
  };
}

export function assertCreatorRecoveryPreconditions(snapshot: CreatorRecoverySnapshot) {
  const counts = snapshot.counts;
  const artifactFailure = counts.artifactLocators !== 2
    || counts.artifactsPresent !== 2
    || snapshot.artifactStatus !== "COMPLETE";
  const databaseFailure = snapshot.creatorLifecycle !== "deleted"
    || snapshot.ownerAuthority !== "none"
    || counts.creatorRows !== 1
    || counts.tombstonedGameRows !== 2
    || counts.activeGameRows !== 0
    || counts.packageRevisionRows !== 1
    || counts.releaseRows !== 0
    || counts.currentReleaseRows !== 0
    || counts.activeCreatorCollisions !== 0
    || !receiptPattern.test(snapshot.dbVersionToken);
  if (artifactFailure || databaseFailure) {
    throw new CreatorRecoveryError(
      "CREATOR_RECOVERY_PRECONDITION_FAILED",
      {
        phase: "dry-run-planning",
        store: artifactFailure ? "git-artifacts" : "sdk-postgres",
      },
    );
  }
}

export function createCreatorRecoveryPlan(
  environment: CreatorRecoveryEnvironment,
  snapshot: CreatorRecoverySnapshot,
): PreparedCreatorRecoveryPlan {
  assertCreatorRecoveryPreconditions(snapshot);
  const planReceipt = digest({
    schemaVersion: 1,
    intent: creatorQuarantineRecoveryIntent,
    target: creatorQuarantineRecoveryTarget,
    environment,
    counts: snapshot.counts,
    artifactStatus: snapshot.artifactStatus,
    dbVersionToken: snapshot.dbVersionToken,
  });
  return {
    concurrencyToken: snapshot.dbVersionToken,
    response: {
      schemaVersion: 1,
      environment,
      scope: "exact-target",
      intent: creatorQuarantineRecoveryIntent,
      target: {
        slug: creatorQuarantineRecoveryTarget,
        lifecycle: "deleted",
        ownerAuthority: "none",
      },
      dryRun: true,
      writesPerformed: 0,
      counts: snapshot.counts,
      artifactStatus: "COMPLETE",
      planReceipt,
      stages: [
        "dry-run",
        "quarantine-reconstruction",
        "verified-owner-binding",
        "user-confirmed-publication",
      ],
      nextStageRequiresSeparateAuthorization: true,
    },
  };
}

export function createCreatorRecoveryTerminalReceipt(input: {
  environment: CreatorRecoveryEnvironment;
  operationId: string;
  planReceipt: string;
  counts: CreatorRecoveryCounts;
  replayed: boolean;
}): CreatorRecoveryTerminalReceipt {
  const terminalReceipt = digest({
    schemaVersion: 1,
    intent: creatorQuarantineRecoveryIntent,
    target: creatorQuarantineRecoveryTarget,
    environment: input.environment,
    operationId: input.operationId,
    planReceipt: input.planReceipt,
    state: "quarantined",
    counts: {
      tombstonedGameRows: input.counts.tombstonedGameRows,
      packageRevisionRows: input.counts.packageRevisionRows,
      artifactLocators: input.counts.artifactLocators,
      releaseRows: input.counts.releaseRows,
    },
  });
  return {
    schemaVersion: 1,
    environment: input.environment,
    scope: "exact-target",
    intent: creatorQuarantineRecoveryIntent,
    target: { slug: creatorQuarantineRecoveryTarget },
    operationId: input.operationId,
    state: "quarantined",
    visibility: "non-public",
    ownerBinding: "unbound",
    publication: "blocked",
    terminalReceipt,
    replayed: input.replayed,
    logicalRecoveryWrites: input.replayed ? 0 : 1,
    counts: {
      tombstonedGameRows: input.counts.tombstonedGameRows,
      packageRevisionRows: input.counts.packageRevisionRows,
      artifactLocators: input.counts.artifactLocators,
      releaseRows: input.counts.releaseRows,
    },
    nextStageRequiresSeparateAuthorization: true,
  };
}

export async function processCreatorRecoveryRequest(
  value: unknown,
  adapter: CreatorRecoveryAdapter,
  options: { faultAt?: CreatorRecoveryFaultPoint } = {},
) {
  const request = parseCreatorRecoveryRequest(value);
  const prepared = await adapter.readPlan();
  if (request.dryRun) return prepared.response;
  if (request.planReceipt !== prepared.response.planReceipt) {
    throw new CreatorRecoveryError(
      "CREATOR_RECOVERY_PLAN_RECEIPT_MISMATCH",
      { phase: "receipt-verification", store: "request" },
    );
  }
  const terminalReceipt = createCreatorRecoveryTerminalReceipt({
    environment: prepared.response.environment,
    operationId: request.operationId!,
    planReceipt: request.planReceipt,
    counts: prepared.response.counts,
    replayed: false,
  }).terminalReceipt;
  return adapter.quarantine({
    operationId: request.operationId!,
    planReceipt: request.planReceipt,
    terminalReceipt,
    concurrencyToken: prepared.concurrencyToken,
    faultAt: options.faultAt,
  });
}

export function creatorRecoveryErrorStatus(error: unknown) {
  if (!(error instanceof CreatorRecoveryError)) return 503;
  if (error.code === "CREATOR_RECOVERY_INPUT_INVALID") return 400;
  if (error.code === "CREATOR_RECOVERY_UNAVAILABLE") return 503;
  return 409;
}
