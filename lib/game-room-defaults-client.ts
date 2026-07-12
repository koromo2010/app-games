type LoadPlayerRoomDefaultsInput<T> = {
  game: string;
  playerId: string;
  localStorageKey: string;
  normalize: (value: unknown) => T;
};

type SavePlayerRoomDefaultsInput<T> = {
  game: string;
  playerId: string;
  localStorageKey: string;
  defaults: T;
};

function loadLocalDefaults<T>(key: string, normalize: (value: unknown) => T) {
  const raw = localStorage.getItem(key);
  if (!raw) return normalize(null);
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return normalize(null);
  }
}

/** Shared per-player room defaults loader for every game. */
export async function loadPlayerRoomDefaults<T>(input: LoadPlayerRoomDefaultsInput<T>) {
  const localDefaults = loadLocalDefaults(input.localStorageKey, input.normalize);
  try {
    const params = new URLSearchParams({ game: input.game, playerId: input.playerId });
    const response = await fetch(`/api/room-defaults?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("ROOM_DEFAULTS_FETCH_FAILED");
    const data = (await response.json()) as { defaults?: unknown };
    if (!data.defaults) return localDefaults;
    const defaults = input.normalize(data.defaults);
    localStorage.setItem(input.localStorageKey, JSON.stringify(defaults));
    return defaults;
  } catch {
    return localDefaults;
  }
}

/** Shared per-player room defaults saver for every game. */
export async function savePlayerRoomDefaults<T>(input: SavePlayerRoomDefaultsInput<T>) {
  localStorage.setItem(input.localStorageKey, JSON.stringify(input.defaults));
  try {
    await fetch("/api/room-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: input.game, playerId: input.playerId, defaults: input.defaults }),
    });
  } catch {
    // Local defaults remain available when the remote store is unavailable.
  }
}
