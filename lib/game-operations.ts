import registry from "@/config/game-registry.json";

export type GameOperationMode = "open" | "maintenance" | "hidden";

export type GameOperation = {
  gameId: string;
  mode: GameOperationMode;
  message: string;
  updatedAt: number | null;
};

export const gameOperationMessageMaxLength = 120;

const registeredIds = new Set(registry.map((game) => game.id));

export function defaultGameOperations(): GameOperation[] {
  return registry.map((game) => ({ gameId: game.id, mode: "open", message: "", updatedAt: null }));
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
    const mode = input?.mode === "maintenance" || input?.mode === "hidden" ? input.mode : "open";
    const message = typeof input?.message === "string"
      ? input.message.replace(/\s+/g, " ").trim().slice(0, gameOperationMessageMaxLength)
      : "";
    return {
      gameId: fallback.gameId,
      mode,
      message,
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
    if (input.mode !== "open" && input.mode !== "maintenance" && input.mode !== "hidden") return "INVALID_GAME_OPERATIONS";
    if (typeof input.message !== "string" || input.message.replace(/\s+/g, " ").trim().length > gameOperationMessageMaxLength) return "INVALID_GAME_OPERATIONS";
    ids.add(input.gameId);
  }
  return null;
}

export function gameOperationFor(operations: GameOperation[], gameId: string) {
  return operations.find((operation) => operation.gameId === gameId)
    ?? { gameId, mode: "open" as const, message: "", updatedAt: null };
}
