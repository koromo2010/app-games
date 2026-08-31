import type { GameOperation } from "@/lib/game-operations";
import type { GameCatalogEntry } from "./game-catalog";

export type DeferredGameLobbyCatalog = {
  version: string;
  additionalGames: GameCatalogEntry[];
  gameOperations: GameOperation[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseDeferredGameLobbyCatalog(
  value: unknown,
): DeferredGameLobbyCatalog | null {
  if (!isRecord(value)) return null;
  if (typeof value.version !== "string" || !/^[a-f0-9]{64}$/.test(value.version)) {
    return null;
  }
  if (!Array.isArray(value.additionalGames) || !Array.isArray(value.gameOperations)) {
    return null;
  }
  const validGames = value.additionalGames.every((game) => (
    isRecord(game)
    && typeof game.id === "string"
    && typeof game.title === "string"
    && typeof game.visual === "string"
    && Array.isArray(game.tags)
    && typeof game.href === "string"
  ));
  const validOperations = value.gameOperations.every((operation) => (
    isRecord(operation)
    && typeof operation.gameId === "string"
    && ["public", "private", "hidden"].includes(String(operation.publication))
    && typeof operation.maintenance === "boolean"
  ));
  if (!validGames || !validOperations) return null;
  return value as DeferredGameLobbyCatalog;
}
