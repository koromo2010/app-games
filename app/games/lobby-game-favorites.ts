export const favoriteGameIdsStorageKey = "game-fields:lobby-favorite-games";
const favoriteGameIdsChangeEvent = "game-fields:lobby-favorite-games-change";
let fallbackFavoriteGameIds = "[]";

export function normalizeFavoriteGameIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
}

export function parseFavoriteGameIds(value: string): string[] {
  try {
    return normalizeFavoriteGameIds(JSON.parse(value));
  } catch {
    return [];
  }
}

export function readFavoriteGameIds(): string {
  try {
    const saved = window.localStorage.getItem(favoriteGameIdsStorageKey);
    fallbackFavoriteGameIds = JSON.stringify(parseFavoriteGameIds(saved || "[]"));
  } catch {
    // Keep the last in-memory choice when storage is unavailable.
  }
  return fallbackFavoriteGameIds;
}

export function subscribeFavoriteGameIds(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === favoriteGameIdsStorageKey) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(favoriteGameIdsChangeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(favoriteGameIdsChangeEvent, onStoreChange);
  };
}

export function saveFavoriteGameIds(ids: Iterable<string>) {
  fallbackFavoriteGameIds = JSON.stringify(normalizeFavoriteGameIds([...ids]));
  try {
    window.localStorage.setItem(favoriteGameIdsStorageKey, fallbackFavoriteGameIds);
  } catch {
    // Storage may be unavailable in privacy-restricted browsers.
  }
  window.dispatchEvent(new Event(favoriteGameIdsChangeEvent));
}

export function sortGamesByFavorite<T extends { id: string }>(games: T[], favoriteIds: ReadonlySet<string>): T[] {
  return games
    .map((game, index) => ({ game, index, favorite: favoriteIds.has(game.id) }))
    .sort((left, right) => Number(right.favorite) - Number(left.favorite) || left.index - right.index)
    .map(({ game }) => game);
}
