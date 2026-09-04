export const productionOwnerRestorationDiagnosticFailureCodes = [
  "OWNER_RESTORATION_DIAGNOSTIC_MODULE_UNAVAILABLE",
  "OWNER_RESTORATION_DIAGNOSTIC_DATABASE_SELECTOR_UNAVAILABLE",
  "OWNER_RESTORATION_DIAGNOSTIC_REQUIRED_SCHEMA_UNAVAILABLE",
  "OWNER_RESTORATION_DIAGNOSTIC_QUERY_TIMEOUT",
  "OWNER_RESTORATION_DIAGNOSTIC_QUERY_PERMISSION_DENIED",
  "OWNER_RESTORATION_DIAGNOSTIC_QUERY_EXECUTION_UNAVAILABLE",
  "OWNER_RESTORATION_DIAGNOSTIC_RESPONSE_PROJECTION_UNSUPPORTED",
  "OWNER_RESTORATION_DIAGNOSTIC_INTERNAL_AUTH_REJECTED",
  "OWNER_RESTORATION_DIAGNOSTIC_UPSTREAM_UNAVAILABLE",
  "OWNER_RESTORATION_DIAGNOSTIC_UPSTREAM_RESPONSE_INVALID",
] as const;

export type ProductionOwnerRestorationDiagnosticFailureCode =
  typeof productionOwnerRestorationDiagnosticFailureCodes[number];

const codes = new Set<string>(productionOwnerRestorationDiagnosticFailureCodes);

export class ProductionOwnerRestorationDiagnosticError extends Error {
  readonly code: ProductionOwnerRestorationDiagnosticFailureCode;

  constructor(code: ProductionOwnerRestorationDiagnosticFailureCode) {
    super(code);
    this.name = "ProductionOwnerRestorationDiagnosticError";
    this.code = code;
  }
}

export function diagnosticFailureCode(value: unknown): ProductionOwnerRestorationDiagnosticFailureCode {
  if (value instanceof ProductionOwnerRestorationDiagnosticError) return value.code;
  return "OWNER_RESTORATION_DIAGNOSTIC_MODULE_UNAVAILABLE";
}

export function isDiagnosticFailureCode(value: unknown): value is ProductionOwnerRestorationDiagnosticFailureCode {
  return typeof value === "string" && codes.has(value);
}

/** Maps only stable driver codes; messages and connection details are never projected. */
export function diagnosticQueryFailureCode(value: unknown): ProductionOwnerRestorationDiagnosticFailureCode {
  const code = value && typeof value === "object" && typeof (value as { code?: unknown }).code === "string"
    ? (value as { code: string }).code
    : "";
  if (code === "42P01" || code === "42703") return "OWNER_RESTORATION_DIAGNOSTIC_REQUIRED_SCHEMA_UNAVAILABLE";
  if (code === "57014" || code === "ETIMEDOUT") return "OWNER_RESTORATION_DIAGNOSTIC_QUERY_TIMEOUT";
  if (code === "42501") return "OWNER_RESTORATION_DIAGNOSTIC_QUERY_PERMISSION_DENIED";
  return "OWNER_RESTORATION_DIAGNOSTIC_QUERY_EXECUTION_UNAVAILABLE";
}
