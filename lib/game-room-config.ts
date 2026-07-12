export const commonTimeLimitOptions = [0, 30, 60, 90, 120] as const;

export function normalizeCommonTimeLimit(value: unknown) {
  const seconds = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  return commonTimeLimitOptions.includes(seconds as (typeof commonTimeLimitOptions)[number]) ? seconds : 0;
}
