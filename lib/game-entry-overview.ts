import type { AppLocale } from "./app-locale.ts";
import { isGameLocaleAvailable, isGameUiLocaleAvailable } from "./game-language.ts";
import { isGameMarketingPagePublished } from "./game-marketing-publication.ts";
import { gameLandingHref, gameRouteForId } from "./game-routes.ts";

export type GameEntryOverviewModel = {
  gameId: string;
  title: string;
  summary: string;
  players: string;
  time: string;
  tags: readonly string[];
  helpHref: string | null;
};

/**
 * Platform-owned play-top data. The registry remains the one source for game
 * copy while publication and locale policy decide whether a help link exists.
 */
export function gameEntryOverviewFor(gameId: string, locale: AppLocale): GameEntryOverviewModel | null {
  const route = gameRouteForId(gameId);
  if (!route) return null;

  const { registration } = route;
  const hasPublishedHelp = isGameMarketingPagePublished(registration)
    && isGameLocaleAvailable(gameId, locale)
    && isGameUiLocaleAvailable(gameId, locale);

  return {
    gameId,
    title: registration.title,
    summary: registration.summary,
    players: registration.players,
    time: registration.time,
    tags: registration.tags,
    helpHref: hasPublishedHelp ? gameLandingHref(gameId) : null,
  };
}
