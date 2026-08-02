const supportRequestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeSupportRequestId(value: unknown) {
  const requestId = typeof value === "string" ? value.trim().toLowerCase() : "";
  return supportRequestIdPattern.test(requestId) ? requestId : null;
}
