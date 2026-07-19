type RotatingTahoiyaTopic = {
  useCount: number;
  lastUsedAt: number;
};

export function pickRotatingTahoiyaTopic<T extends RotatingTahoiyaTopic>(
  candidates: readonly T[],
  qualityScore: (candidate: T) => number,
  random = Math.random,
  poolLimit = 50,
) {
  const safePoolLimit = Math.max(1, Math.min(100, Math.floor(poolLimit)));
  const pool = [...candidates]
    .sort((left, right) => left.useCount - right.useCount || left.lastUsedAt - right.lastUsedAt)
    .slice(0, safePoolLimit);
  if (pool.length === 0) return null;

  const weights = pool.map((candidate) => 1 + Math.max(0, Math.min(5, qualityScore(candidate))));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let roll = Math.max(0, Math.min(0.999999999, random())) * totalWeight;
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return pool[index];
  }
  return pool.at(-1) ?? null;
}
