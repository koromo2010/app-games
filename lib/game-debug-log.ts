export type GameDebugLogEntry = {
  id: string;
  timestamp: number;
  actorName: string;
  action: string;
  phaseBefore: string;
  phaseAfter: string;
  revision: number;
};

const debugLogLimit = 200;

export function normalizeGameDebugLog(value: unknown): GameDebugLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Partial<GameDebugLogEntry>;
    if (typeof entry.timestamp !== "number" || typeof entry.action !== "string") return [];
    return [{
      id: typeof entry.id === "string" ? entry.id.slice(0, 120) : `debug-${entry.timestamp}`,
      timestamp: entry.timestamp,
      actorName: typeof entry.actorName === "string" ? entry.actorName.slice(0, 40) : "システム",
      action: entry.action.slice(0, 80),
      phaseBefore: typeof entry.phaseBefore === "string" ? entry.phaseBefore.slice(0, 40) : "unknown",
      phaseAfter: typeof entry.phaseAfter === "string" ? entry.phaseAfter.slice(0, 40) : "unknown",
      revision: typeof entry.revision === "number" ? Math.max(0, Math.floor(entry.revision)) : 0,
    }];
  }).slice(-debugLogLimit);
}

export function appendGameDebugLog(entries: GameDebugLogEntry[], entry: Omit<GameDebugLogEntry, "id">) {
  const nextEntry: GameDebugLogEntry = {
    ...entry,
    id: `debug-${entry.timestamp}-${entry.revision}-${entries.length}`,
  };
  return [...entries, nextEntry].slice(-debugLogLimit);
}
