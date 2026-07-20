export const tahoiyaHistoryTopicIdPattern = /^word-v1:[A-Za-z0-9_-]{43}$/;

export function normalizeTahoiyaHistoryWord(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

export function isTahoiyaHistoryTopicId(value: unknown): value is string {
  return typeof value === "string" && tahoiyaHistoryTopicIdPattern.test(value);
}

export function normalizeTahoiyaHistoryTopicIds(value: unknown, limit = 100) {
  if (!Array.isArray(value)) return [];
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return [...new Set(value.filter(isTahoiyaHistoryTopicId))].slice(0, safeLimit);
}
