export const onlineRoomPollingIntervals = {
  realtime: 1_000,
  active: 3_000,
  idle: 5_000,
} as const;

const maximumOnlineRoomPollingDelayMs = 30_000;
const maximumRealtimeFallbackIntervalMs = 2_000;

export function onlineRoomFallbackInterval(intervalMs: number, realtimeDisabled: boolean) {
  return realtimeDisabled
    ? intervalMs
    : Math.min(intervalMs, maximumRealtimeFallbackIntervalMs);
}

export function onlineRoomPollingDelay(intervalMs: number, consecutiveFailures: number) {
  const multiplier = 2 ** Math.min(Math.max(0, consecutiveFailures), 5);
  return Math.min(maximumOnlineRoomPollingDelayMs, Math.max(intervalMs, intervalMs * multiplier));
}

export function onlineRoomPollingJitter(delayMs: number, randomValue = Math.random()) {
  const normalizedRandom = Math.min(1, Math.max(0, randomValue));
  return Math.round(delayMs * (0.9 + normalizedRandom * 0.2));
}
