export const tahoiyaFakeDefinitionsPerPlayerChoices = [1, 2, 3] as const;

export function normalizeTahoiyaFakeDefinitionsPerPlayer(value: unknown) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(3, count));
}

export function normalizeTahoiyaFakeDefinitions(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([playerId, definitions]) => {
      if (!playerId) return [];
      if (typeof definitions === "string") return [[playerId, [definitions]]];
      if (!Array.isArray(definitions)) return [];
      return [[playerId, definitions.slice(0, 3).map((definition) => typeof definition === "string" ? definition : "")]];
    }),
  );
}
