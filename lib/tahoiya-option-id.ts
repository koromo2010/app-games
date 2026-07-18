const legacyOptionIdPattern = /^(?:real|fake)-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function normalizeTahoiyaOptionId(value: unknown) {
  const id = String(value);
  return id.match(legacyOptionIdPattern)?.[1] ?? id;
}
