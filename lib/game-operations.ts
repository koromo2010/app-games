import registry from "@/config/game-registry.json";

export type GamePublication = "public" | "private" | "hidden";

export type GameOperation = {
  gameId: string;
  publication: GamePublication;
  maintenance: boolean;
  message: string;
  updatedAt: number | null;
};

export const gameOperationMessageMaxLength = 120;

const registeredIds = new Set(registry.map((game) => game.id));

export function defaultGameOperations(): GameOperation[] {
  return registry.map((game) => ({ gameId: game.id, publication: game.private ? "private" : "public", maintenance: false, message: "", updatedAt: null }));
}

export function normalizeGameOperations(value: unknown): GameOperation[] {
  const items = Array.isArray(value) ? value : [];
  const byId = new Map<string, Partial<GameOperation>>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const input = item as Partial<GameOperation>;
    if (typeof input.gameId === "string" && registeredIds.has(input.gameId)) byId.set(input.gameId, input);
  }
  return defaultGameOperations().map((fallback) => {
    const input = byId.get(fallback.gameId);
    const publication = input?.publication === "private" || input?.publication === "hidden" ? input.publication : fallback.publication;
    const message = typeof input?.message === "string"
      ? input.message.replace(/\s+/g, " ").trim().slice(0, gameOperationMessageMaxLength)
      : "";
    return {
      gameId: fallback.gameId,
      publication,
      maintenance: input?.maintenance === true,
      message,
      updatedAt: typeof input?.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : null,
    };
  });
}

/** Migrates the v1 single-mode setting without exposing registry-private games. */
export function migrateLegacyGameOperations(value: unknown): GameOperation[] {
  const items = Array.isArray(value) ? value : [];
  const legacyById = new Map<string, { mode?: unknown; message?: unknown; updatedAt?: unknown }>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const input = item as { gameId?: unknown; mode?: unknown; message?: unknown; updatedAt?: unknown };
    if (typeof input.gameId === "string" && registeredIds.has(input.gameId)) legacyById.set(input.gameId, input);
  }
  return defaultGameOperations().map((fallback) => {
    const input = legacyById.get(fallback.gameId);
    return {
      ...fallback,
      publication: input?.mode === "hidden" ? "hidden" : fallback.publication,
      maintenance: input?.mode === "maintenance",
      message: typeof input?.message === "string" ? input.message.replace(/\s+/g, " ").trim().slice(0, gameOperationMessageMaxLength) : "",
      updatedAt: typeof input?.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : null,
    };
  });
}

export function validateGameOperationsInput(value: unknown) {
  if (!Array.isArray(value) || value.length !== registry.length) return "INVALID_GAME_OPERATIONS";
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return "INVALID_GAME_OPERATIONS";
    const input = item as Partial<GameOperation>;
    if (typeof input.gameId !== "string" || !registeredIds.has(input.gameId) || ids.has(input.gameId)) return "INVALID_GAME_OPERATIONS";
    if (input.publication !== "public" && input.publication !== "private" && input.publication !== "hidden") return "INVALID_GAME_OPERATIONS";
    if (typeof input.maintenance !== "boolean") return "INVALID_GAME_OPERATIONS";
    if (typeof input.message !== "string" || input.message.replace(/\s+/g, " ").trim().length > gameOperationMessageMaxLength) return "INVALID_GAME_OPERATIONS";
    ids.add(input.gameId);
  }
  return null;
}

export function gameOperationFor(operations: GameOperation[], gameId: string) {
  return operations.find((operation) => operation.gameId === gameId)
    ?? defaultGameOperations().find((operation) => operation.gameId === gameId)
    ?? { gameId, publication: "hidden" as const, maintenance: false, message: "", updatedAt: null };
}
