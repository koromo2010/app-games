const CREATOR_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;

export const SDK_PREVIEW_NAVIGATION_MESSAGE =
  "game-fields:preview-navigation-v1" as const;
export const SDK_PREVIEW_NAVIGATION_SYNC_MESSAGE =
  "game-fields:preview-navigation-sync-v1" as const;

export type SdkPreviewNavigationState = {
  creatorSlug: string;
  gameId?: string;
  revision?: string;
};

function optionalRevision(value: unknown) {
  if (value === undefined || value === "") return undefined;
  return typeof value === "string" && REVISION_PATTERN.test(value)
    ? value
    : null;
}

export function normalizeSdkPreviewNavigationState(
  value: unknown,
): SdkPreviewNavigationState | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const creatorSlug = typeof input.creatorSlug === "string"
    ? input.creatorSlug.trim().toLowerCase()
    : "";
  const gameId = input.gameId === undefined || input.gameId === ""
    ? undefined
    : typeof input.gameId === "string"
      ? input.gameId.trim().toLowerCase()
      : "";
  const revision = optionalRevision(input.revision);
  if (
    !CREATOR_PATTERN.test(creatorSlug)
    || (gameId !== undefined && !GAME_PATTERN.test(gameId))
    || revision === null
  ) return null;
  return {
    creatorSlug,
    ...(gameId ? { gameId } : {}),
    ...(revision ? { revision } : {}),
  };
}

export function sdkPreviewNavigationMessage(
  state: SdkPreviewNavigationState,
) {
  return {
    type: SDK_PREVIEW_NAVIGATION_MESSAGE,
    ...state,
  } as const;
}

export function sdkPreviewPathForState(state: SdkPreviewNavigationState) {
  const base = `/sdk-preview/${encodeURIComponent(state.creatorSlug)}`;
  if (!state.gameId) return base;
  const query = state.revision
    ? `?revision=${encodeURIComponent(state.revision)}`
    : "";
  return `${base}/games/${encodeURIComponent(state.gameId)}${query}`;
}

export function sdkPortalPathForState(state: SdkPreviewNavigationState) {
  const base = `/${encodeURIComponent(state.creatorSlug)}`;
  if (!state.gameId) return base;
  const query = state.revision
    ? `?revision=${encodeURIComponent(state.revision)}`
    : "";
  return `${base}/games/${encodeURIComponent(state.gameId)}${query}`;
}

export function sdkPreviewNavigationStateFromPath(
  pathname: string,
  search = "",
) {
  const match = pathname.match(
    /^\/sdk-preview\/([^/]+)(?:\/games\/([^/]+))?\/?$/,
  );
  if (!match) return null;
  const query = new URLSearchParams(search);
  return normalizeSdkPreviewNavigationState({
    creatorSlug: decodeURIComponent(match[1] ?? ""),
    ...(match[2] ? { gameId: decodeURIComponent(match[2]) } : {}),
    ...(query.get("revision") ? { revision: query.get("revision") } : {}),
  });
}

export function sdkPortalNavigationStateFromPath(
  pathname: string,
  search = "",
) {
  const match = pathname.match(
    /^\/([^/]+)(?:\/games\/([^/]+))?\/?$/,
  );
  if (!match) return null;
  const query = new URLSearchParams(search);
  return normalizeSdkPreviewNavigationState({
    creatorSlug: decodeURIComponent(match[1] ?? ""),
    ...(match[2] ? { gameId: decodeURIComponent(match[2]) } : {}),
    ...(query.get("revision") ? { revision: query.get("revision") } : {}),
  });
}
