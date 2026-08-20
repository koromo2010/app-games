export const playerAccountActivityTouchIntervalMs = 24 * 60 * 60 * 1_000;

export function normalizePlayerAccountActivityAt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export function playerAccountActivityTouchDue(
  lastActivityAt: number | null,
  now = Date.now(),
  intervalMs = playerAccountActivityTouchIntervalMs,
) {
  return lastActivityAt === null || lastActivityAt <= now - intervalMs;
}

/**
 * Activity time is server-owned. A supplied client timestamp is never an
 * input, and a persisted value can only advance.
 */
export function nextPlayerAccountActivityAt(
  lastActivityAt: number | null,
  now = Date.now(),
) {
  return Math.max(lastActivityAt ?? 0, Math.floor(now));
}
