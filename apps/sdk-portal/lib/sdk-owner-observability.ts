import type { SdkOwnerStatus } from "./sdk-owner-classification";

export const SDK_OWNER_EVENT_CODES = {
  identityMismatch: "SDK_OWNER_IDENTITY_MISMATCH",
  creatorNotFound: "SDK_OWNER_CREATOR_NOT_FOUND",
  creatorDeleted: "SDK_OWNER_CREATOR_DELETED",
  identityMissing: "SDK_OWNER_IDENTITY_MISSING",
  schemaCheckFailed: "SDK_OWNER_SCHEMA_CHECK_FAILED",
  lookupFailed: "SDK_OWNER_LOOKUP_FAILED",
  sessionLookupFailed: "SDK_SESSION_LOOKUP_FAILED",
} as const;

export type SdkOwnerEventCode =
  (typeof SDK_OWNER_EVENT_CODES)[keyof typeof SDK_OWNER_EVENT_CODES];

export type SdkOwnerLookupPhase = "schema" | "lookup";

export class SdkOwnerLookupError extends Error {
  readonly phase: SdkOwnerLookupPhase;
  readonly errorClass: string;
  readonly errorCode: string;

  constructor(phase: SdkOwnerLookupPhase, error: unknown) {
    super("SDK owner lookup unavailable.");
    this.name = "SdkOwnerLookupError";
    this.phase = phase;
    this.errorClass = sanitizeErrorClass(error);
    this.errorCode = sanitizeErrorCode(error);
  }
}

export function sanitizeErrorCode(error: unknown) {
  const candidate = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : typeof error === "object" && error !== null && "errorCode" in error
      ? (error as { errorCode?: unknown }).errorCode
      : undefined;
  if (typeof candidate !== "string" || !/^[A-Za-z0-9_]{1,32}$/.test(candidate)) {
    return "UNKNOWN";
  }
  return candidate;
}

export function sanitizeErrorClass(error: unknown) {
  const candidate = error instanceof Error ? error.name : "UnknownError";
  if (!/^[A-Za-z0-9_]{1,48}$/.test(candidate)) return "UNKNOWN";
  return candidate;
}

function emit(event: SdkOwnerEventCode, outcome: string, error?: {
  errorClass: string;
  errorCode: string;
}) {
  const payload = {
    event,
    outcome,
    ...(error ? { errorClass: error.errorClass, errorCode: error.errorCode } : {}),
  };
  console.warn(JSON.stringify(payload));
}

export function logSdkOwnerResult(status: string) {
  switch (status) {
    case "creator_not_found":
      emit(SDK_OWNER_EVENT_CODES.creatorNotFound, "record_inconsistency");
      return;
    case "creator_deleted":
      emit(SDK_OWNER_EVENT_CODES.creatorDeleted, "record_inconsistency");
      return;
    case "owner_null":
    case "owner_empty":
      emit(SDK_OWNER_EVENT_CODES.identityMissing, "record_inconsistency");
      return;
    case "owner_mismatch":
      emit(SDK_OWNER_EVENT_CODES.identityMismatch, "mismatch");
      return;
    default:
      return;
  }
}

export function logSdkOwnerLookupFailure(error: unknown) {
  const normalized = error instanceof SdkOwnerLookupError
    ? error
    : new SdkOwnerLookupError("lookup", error);
  emit(
    normalized.phase === "schema"
      ? SDK_OWNER_EVENT_CODES.schemaCheckFailed
      : SDK_OWNER_EVENT_CODES.lookupFailed,
    "unavailable",
    normalized,
  );
}

export function logSdkSessionLookupFailure(error: unknown) {
  emit(
    SDK_OWNER_EVENT_CODES.sessionLookupFailed,
    "unavailable",
    {
      errorClass: sanitizeErrorClass(error),
      errorCode: sanitizeErrorCode(error),
    },
  );
}

export function isOwnerRecordInconsistency(status: SdkOwnerStatus) {
  return status === "creator_not_found"
    || status === "creator_deleted"
    || status === "owner_null"
    || status === "owner_empty";
}
