export const SUPPORT_TEXT_LIMITS = {
  summary: 120,
  details: 12_000,
  page: 200,
  reply: 3_000,
} as const;

export type SupportTextField = keyof typeof SUPPORT_TEXT_LIMITS;

export class SupportTextValidationError extends Error {
  readonly field: SupportTextField;
  readonly limit: number;
  readonly length: number;
  readonly reason: "required" | "too-long";

  constructor(
    field: SupportTextField,
    length: number,
    reason: "required" | "too-long",
  ) {
    super(`SUPPORT_${field.toUpperCase()}_${reason === "required" ? "REQUIRED" : "TOO_LONG"}`);
    this.name = "SupportTextValidationError";
    this.field = field;
    this.limit = SUPPORT_TEXT_LIMITS[field];
    this.length = length;
    this.reason = reason;
  }
}

export function validateSupportText(
  value: unknown,
  field: SupportTextField,
  options: { required?: boolean } = {},
) {
  const text = typeof value === "string" ? value : "";
  if (options.required && !text.trim()) {
    throw new SupportTextValidationError(field, text.length, "required");
  }
  const limit = SUPPORT_TEXT_LIMITS[field];
  if (text.length > limit) {
    throw new SupportTextValidationError(field, text.length, "too-long");
  }
  return text;
}

export function validateSupportReportText(input: {
  summary?: unknown;
  details?: unknown;
  page?: unknown;
}) {
  return {
    summary: validateSupportText(input.summary, "summary", { required: true }),
    details: validateSupportText(input.details, "details"),
    page: validateSupportText(input.page, "page"),
  };
}

export function supportTextValidationPayload(error: SupportTextValidationError) {
  return {
    error: error.reason === "too-long"
      ? "support_text_too_long"
      : "support_text_required",
    field: error.field,
    limit: error.limit,
    length: error.length,
  };
}
