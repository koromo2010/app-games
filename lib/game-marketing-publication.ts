import {
  resolveGameFieldsEnvironment,
  type GameFieldsEnvironment,
} from "./game-fields-environment.ts";

export const gameMarketingPageStatuses = ["draft", "published"] as const;

export type GameMarketingPageStatus = (typeof gameMarketingPageStatuses)[number];

type GameMarketingRegistration = {
  marketingPage?: {
    status?: unknown;
  };
};

const validStatuses = new Set<string>(gameMarketingPageStatuses);

export function requireGameMarketingPageStatus(
  registration: GameMarketingRegistration,
): GameMarketingPageStatus {
  const status = registration.marketingPage?.status;
  if (typeof status !== "string" || !validStatuses.has(status)) {
    throw new Error("GAME_MARKETING_PAGE_STATUS_INVALID");
  }
  return status as GameMarketingPageStatus;
}

export function isGameMarketingPagePublished(registration: GameMarketingRegistration) {
  return requireGameMarketingPageStatus(registration) === "published";
}

export function isGameMarketingPageVisible(
  registration: GameMarketingRegistration,
  environment?: GameFieldsEnvironment,
) {
  if (isGameMarketingPagePublished(registration)) return true;
  return resolveGameFieldsEnvironment(environment) !== "production";
}
