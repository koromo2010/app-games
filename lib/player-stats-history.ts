export function mergePlayerGameResults<T extends { id: string; finishedAt: number }>(primary: T[], fallback: T[], limit = 200) {
  const byId = new Map<string, T>();
  for (const result of fallback) byId.set(result.id, result);
  for (const result of primary) byId.set(result.id, result);
  return [...byId.values()].sort((left, right) => right.finishedAt - left.finishedAt).slice(0, limit);
}
