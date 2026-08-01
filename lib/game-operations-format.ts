import registry from "../config/game-registry.json" with { type: "json" };
import {
  normalizeGamePublication,
  type GamePublication,
} from "./game-publication.ts";

export type { GamePublication } from "./game-publication.ts";

export type GameOperation = {
  gameId: string;
  publication: GamePublication;
  maintenance: boolean;
  message: string;
  updatedAt: number | null;
};

export type GameOperationDefinition = {
  id: string;
  private?: boolean;
};

export const gameOperationMessageMaxLength = 120;

const registeredIds = new Set(registry.map((game) => game.id));
const dynamicGameIdPattern = /^[a-z][a-z0-9-]{1,63}$/;

export function registeredGameOperationIds() {
  return [...registeredIds];
}

export function isStoredGameOperationId(value: unknown) {
  return typeof value === "string"
    && (registeredIds.has(value) || dynamicGameIdPattern.test(value));
}

export function defaultGameOperations(
  additionalGames: GameOperationDefinition[] = [],
): GameOperation[] {
  const definitions = [
    ...registry,
    ...additionalGames.filter((game) => !registeredIds.has(game.id)),
  ];
  return definitions.map((game) => ({
    gameId: game.id,
    publication: game.private ? "private" : "public",
    maintenance: false,
    message: "",
    updatedAt: null,
  }));
}

export function normalizeGameOperationMessage(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, gameOperationMessageMaxLength)
    : "";
}

export function normalizeGameOperations(
  value: unknown,
  additionalGames: GameOperationDefinition[] = [],
): GameOperation[] {
  const items = Array.isArray(value) ? value : [];
  const byId = new Map<string, Partial<GameOperation>>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const input = item as Partial<GameOperation>;
    if (isStoredGameOperationId(input.gameId)) byId.set(input.gameId!, input);
  }
  const dynamicStoredGames = [...byId.keys()]
    .filter((id) => !registeredIds.has(id))
    .map((id) => ({ id }));
  return defaultGameOperations([...dynamicStoredGames, ...additionalGames]).map((fallback) => {
    const input = byId.get(fallback.gameId);
    return {
      gameId: fallback.gameId,
      publication: normalizeGamePublication(input?.publication, fallback.publication),
      maintenance: input?.maintenance === true,
      message: normalizeGameOperationMessage(input?.message),
      updatedAt: typeof input?.updatedAt === "number" && Number.isFinite(input.updatedAt)
        ? input.updatedAt
        : null,
    };
  });
}

/** Tolerant v1 reader used by public fallback only. */
export function migrateLegacyGameOperations(value: unknown): GameOperation[] {
  const items = Array.isArray(value) ? value : [];
  const legacyById = new Map<string, { mode?: unknown; message?: unknown; updatedAt?: unknown }>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const input = item as { gameId?: unknown; mode?: unknown; message?: unknown; updatedAt?: unknown };
    if (typeof input.gameId === "string" && registeredIds.has(input.gameId)) {
      legacyById.set(input.gameId, input);
    }
  }
  return defaultGameOperations().map((fallback) => {
    const input = legacyById.get(fallback.gameId);
    return {
      ...fallback,
      publication: input?.mode === "hidden" ? "hidden" : fallback.publication,
      maintenance: input?.mode === "maintenance",
      message: normalizeGameOperationMessage(input?.message),
      updatedAt: typeof input?.updatedAt === "number" && Number.isFinite(input.updatedAt)
        ? input.updatedAt
        : null,
    };
  });
}

export function validateGameOperationsInput(
  value: unknown,
  additionalGames: GameOperationDefinition[] = [],
) {
  const allowedIds = new Set([...registeredIds, ...additionalGames.map((game) => game.id)]);
  if (!Array.isArray(value) || value.length !== allowedIds.size) return "INVALID_GAME_OPERATIONS";
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return "INVALID_GAME_OPERATIONS";
    const input = item as Partial<GameOperation>;
    if (typeof input.gameId !== "string" || !allowedIds.has(input.gameId) || ids.has(input.gameId)) return "INVALID_GAME_OPERATIONS";
    if (input.publication !== "public" && input.publication !== "private" && input.publication !== "hidden") return "INVALID_GAME_OPERATIONS";
    if (typeof input.maintenance !== "boolean") return "INVALID_GAME_OPERATIONS";
    if (
      typeof input.message !== "string"
      || input.message.replace(/\s+/g, " ").trim().length > gameOperationMessageMaxLength
    ) return "INVALID_GAME_OPERATIONS";
    ids.add(input.gameId);
  }
  return null;
}

export function gameOperationFor(operations: GameOperation[], gameId: string) {
  return operations.find((operation) => operation.gameId === gameId)
    ?? defaultGameOperations().find((operation) => operation.gameId === gameId)
    ?? { gameId, publication: "hidden" as const, maintenance: false, message: "", updatedAt: null };
}
