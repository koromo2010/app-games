export type GameTimerPolicy = {
  startedAt: number | null | undefined;
  durationMs: number;
  graceMs: number;
};

export function timerHyperparameter(name: string, fallback: number, min = 0, max = 60000) {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured >= min && configured <= max ? Math.floor(configured) : fallback;
}

export function getGameTimerDeadlineAt(policy: GameTimerPolicy) {
  return policy.startedAt && policy.durationMs > 0 ? policy.startedAt + policy.durationMs : null;
}

export function getGameTimerExpiresAt(policy: GameTimerPolicy) {
  const deadline = getGameTimerDeadlineAt(policy);
  return deadline ? deadline + policy.graceMs : null;
}

export function isGameTimerExpired(policy: GameTimerPolicy, now = Date.now()) {
  const expiresAt = getGameTimerExpiresAt(policy);
  return Boolean(expiresAt && now >= expiresAt);
}

export function getGameTimerRetryAfterMs(policy: GameTimerPolicy, now = Date.now()) {
  const expiresAt = getGameTimerExpiresAt(policy);
  return expiresAt ? Math.max(0, expiresAt - now) : 0;
}
