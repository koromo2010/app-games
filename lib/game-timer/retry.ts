export const authoritativeTimerMaximumRetryAfterMs = 60_000;

function boundedRetryAfterMs(value: number) {
  return Math.max(
    0,
    Math.min(authoritativeTimerMaximumRetryAfterMs, Math.ceil(value)),
  );
}

export class AuthoritativeTimerNotExpiredError extends Error {
  readonly code: string;
  readonly retryAfterMs: number;
  readonly serverDeadlineAt: number;

  constructor(code: string, serverDeadlineAt: number, now = Date.now()) {
    super(code);
    this.name = "AuthoritativeTimerNotExpiredError";
    this.code = code;
    this.serverDeadlineAt = serverDeadlineAt;
    this.retryAfterMs = boundedRetryAfterMs(serverDeadlineAt - now);
  }
}

export type AuthoritativeTimerRejection = {
  code: string;
  retryAfterMs: number;
  serverDeadlineAt: number;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

export function authoritativeTimerRejectionFrom(
  value: unknown,
): AuthoritativeTimerRejection | null {
  const source = objectValue(value);
  if (!source) return null;
  const payload = objectValue(source.payload);
  const code = typeof source.code === "string"
    ? source.code
    : typeof payload?.errorCode === "string"
      ? payload.errorCode
      : typeof payload?.error === "string"
        ? payload.error
        : value instanceof Error
          ? value.message
          : "";
  const retryAfterMs = Number(source.retryAfterMs ?? payload?.retryAfterMs);
  const serverDeadlineAt = Number(
    source.serverDeadlineAt ?? payload?.serverDeadlineAt,
  );
  if (
    !/^[A-Z][A-Z0-9_]{1,79}_NOT_EXPIRED$/.test(code)
    || !Number.isFinite(retryAfterMs)
    || !Number.isFinite(serverDeadlineAt)
  ) return null;
  return {
    code,
    retryAfterMs: boundedRetryAfterMs(retryAfterMs),
    serverDeadlineAt,
  };
}

export type AuthoritativeTimerErrorDirective =
  | ({ kind: "early" } & AuthoritativeTimerRejection)
  | { kind: "superseded"; code: string }
  | { kind: "ambiguous"; code: string }
  | { kind: "failed"; code: string };

export function authoritativeTimerErrorDirective(
  error: unknown,
  terminalCodes: ReadonlySet<string>,
  ambiguousCodes: ReadonlySet<string> = new Set(),
): AuthoritativeTimerErrorDirective {
  const rejection = authoritativeTimerRejectionFrom(error);
  if (rejection) return { kind: "early", ...rejection };
  const source = objectValue(error);
  const payload = objectValue(source?.payload);
  const code = typeof source?.code === "string"
    ? source.code
    : typeof payload?.errorCode === "string"
      ? payload.errorCode
      : typeof payload?.error === "string"
        ? payload.error
        : error instanceof Error
          ? error.message
          : "TIMER_FINALIZATION_FAILED";
  if (terminalCodes.has(code)) return { kind: "superseded", code };
  if (ambiguousCodes.has(code)) return { kind: "ambiguous", code };
  return typeof source?.status === "number"
    ? { kind: "failed", code }
    : { kind: "ambiguous", code };
}
