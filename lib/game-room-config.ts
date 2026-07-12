export const commonTimeLimitOptions = [0, 30, 60, 90, 120] as const;
export const commonTimeLimitMaxSeconds = 3600;

export function normalizeCommonTimeLimit(value: unknown) {
  const seconds = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, Math.min(commonTimeLimitMaxSeconds, seconds));
}
