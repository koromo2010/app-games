const encode = encodeURIComponent;

export type CreatorGameRouteIdentity = {
  creatorSlug: string;
  gameId: string;
  revision: string;
};

export function creatorEnvironmentPath(creatorSlug: string) {
  return `/${encode(creatorSlug)}`;
}

export function creatorGameModulesPath(input: Omit<CreatorGameRouteIdentity, "revision">) {
  return `/${encode(input.creatorSlug)}/games/${encode(input.gameId)}?view=modules`;
}

export function creatorGamePreviewPath(input: CreatorGameRouteIdentity) {
  return `/${encode(input.creatorSlug)}/games/${encode(input.gameId)}?view=preview&revision=${encode(input.revision)}`;
}

export function creatorGameFormalRoomPath(input: CreatorGameRouteIdentity) {
  return `/${encode(input.creatorSlug)}/games/${encode(input.gameId)}?revision=${encode(input.revision)}`;
}

export function creatorPreviewSurfaceIdentity(input: CreatorGameRouteIdentity & {
  environment: "development" | "production";
}) {
  return {
    creatorSlug: input.creatorSlug,
    gameId: input.gameId,
    revision: input.revision,
    environment: input.environment,
    surface: "preview" as const,
    formalRoom: false as const,
  };
}
