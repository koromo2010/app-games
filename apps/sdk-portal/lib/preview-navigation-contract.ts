const CREATOR_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;

export const SDK_PREVIEW_NAVIGATION_MESSAGE =
  "game-fields:preview-navigation-v1" as const;
export const SDK_PREVIEW_NAVIGATION_SYNC_MESSAGE =
  "game-fields:preview-navigation-sync-v1" as const;

export type PreviewNavigationState = {
  creatorSlug: string;
  gameId?: string;
  revision?: string;
};

function revision(value: unknown) {
  if (value === undefined || value === "") return undefined;
  return typeof value === "string" && REVISION_PATTERN.test(value)
    ? value
    : null;
}

export function parsePreviewNavigationMessage(
  value: unknown,
  creatorSlug: string,
): PreviewNavigationState | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.type !== SDK_PREVIEW_NAVIGATION_MESSAGE) return null;
  const stateCreator = typeof input.creatorSlug === "string"
    ? input.creatorSlug.trim().toLowerCase()
    : "";
  const gameId = input.gameId === undefined || input.gameId === ""
    ? undefined
    : typeof input.gameId === "string"
      ? input.gameId.trim().toLowerCase()
      : "";
  const stateRevision = revision(input.revision);
  if (
    stateCreator !== creatorSlug
    || !CREATOR_PATTERN.test(stateCreator)
    || (gameId !== undefined && !GAME_PATTERN.test(gameId))
    || stateRevision === null
  ) return null;
  return {
    creatorSlug: stateCreator,
    ...(gameId ? { gameId } : {}),
    ...(stateRevision ? { revision: stateRevision } : {}),
  };
}

export function portalPathForPreviewState(state: PreviewNavigationState) {
  const base = `/${encodeURIComponent(state.creatorSlug)}`;
  if (!state.gameId) return base;
  return `${base}/games/${encodeURIComponent(state.gameId)}${state.revision
    ? `?revision=${encodeURIComponent(state.revision)}`
    : ""}`;
}

export function previewPathForPreviewState(state: PreviewNavigationState) {
  const base = `/sdk-preview/${encodeURIComponent(state.creatorSlug)}`;
  if (!state.gameId) return base;
  return `${base}/games/${encodeURIComponent(state.gameId)}${state.revision
    ? `?revision=${encodeURIComponent(state.revision)}`
    : ""}`;
}

export function parsePortalPath(
  pathname: string,
  search: string,
  creatorSlug: string,
) {
  const match = pathname.match(/^\/([^/]+)(?:\/games\/([^/]+))?\/?$/);
  if (!match || decodeURIComponent(match[1] ?? "") !== creatorSlug) return null;
  const query = new URLSearchParams(search);
  const stateRevision = revision(query.get("revision") ?? undefined);
  if (stateRevision === null) return null;
  const gameId = match[2] ? decodeURIComponent(match[2]) : undefined;
  if (gameId && !GAME_PATTERN.test(gameId)) return null;
  return {
    creatorSlug,
    ...(gameId ? { gameId } : {}),
    ...(stateRevision ? { revision: stateRevision } : {}),
  } satisfies PreviewNavigationState;
}
