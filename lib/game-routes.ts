import registry from "../config/game-registry.json" with { type: "json" };
import { isAppLocale, type AppLocale } from "./app-locale.ts";
import type { GameFieldsEnvironment } from "./game-fields-environment.ts";
import {
  isGameMarketingPagePublished,
  isGameMarketingPageVisible,
  requireGameMarketingPageStatus,
} from "./game-marketing-publication.ts";

const slugOverrides: Record<string, string> = {
  wordwolf: "word-wolf",
  hodoai: "word-scale",
  "kotoba-senpuku": "word-sonar",
  nigoichi: "word-out",
};

const legacyAliases: Record<string, string[]> = {
  hodoai: ["/hodoai-talk"],
  "kotoba-senpuku": ["/kotoba-senpuku"],
  nigoichi: ["/nigoichi"],
  "code-intercept": ["/code-intercept"],
};

export type BuiltInGameRegistration = (typeof registry)[number];

export type BuiltInGameRoute = {
  id: string;
  slug: string;
  landingPath: string;
  playPath: string;
  legacyPaths: string[];
  registration: BuiltInGameRegistration;
};

function normalizePathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export const builtInGameRoutes: BuiltInGameRoute[] = registry.map((registration) => {
  requireGameMarketingPageStatus(registration);
  const slug = slugOverrides[registration.id] ?? registration.id;
  const landingPath = `/games/${slug}`;
  const legacyPaths = new Set([
    ...(registration.href !== landingPath ? [registration.href] : []),
    ...(legacyAliases[registration.id] ?? []),
  ]);
  return {
    id: registration.id,
    slug,
    landingPath,
    playPath: `/play/${slug}`,
    legacyPaths: [...legacyPaths],
    registration,
  };
});

export function gameRouteForId(gameId: string) {
  return builtInGameRoutes.find((route) => route.id === gameId) ?? null;
}

export function gameRouteForSlug(slug: string) {
  return builtInGameRoutes.find((route) => route.slug === slug) ?? null;
}

export function gameLandingHref(gameId: string) {
  return gameRouteForId(gameId)?.landingPath ?? "";
}

export function gameCatalogHref(gameId: string) {
  const route = gameRouteForId(gameId);
  if (!route) return "";
  return isGameMarketingPagePublished(route.registration)
    ? route.landingPath
    : route.playPath;
}

export function gamePlayHref(gameId: string, roomCode?: string) {
  const path = gameRouteForId(gameId)?.playPath ?? "";
  if (!path || !roomCode) return path;
  return `${path}?room=${encodeURIComponent(roomCode)}`;
}

export function publishedMarketingGameRoutes() {
  return builtInGameRoutes.filter((route) =>
    isGameMarketingPagePublished(route.registration));
}

export function visibleMarketingGameRoutes(environment?: GameFieldsEnvironment) {
  return builtInGameRoutes.filter((route) =>
    isGameMarketingPageVisible(route.registration, environment));
}

export function gameMarketingRouteForPathname(pathname: string) {
  const normalized = normalizePathname(pathname);
  const firstSegment = normalized.split("/")[1];
  const locale = isAppLocale(firstSegment) ? firstSegment : null;
  const unlocalized = locale
    ? normalizePathname(normalized.slice(locale.length + 1) || "/")
    : normalized;
  const match = /^\/games\/([^/]+)$/.exec(unlocalized);
  return match ? gameRouteForSlug(match[1]) : null;
}

export function legacyGamePlayRoute(pathname: string): {
  locale: AppLocale | null;
  playPath: string;
} | null {
  const normalized = normalizePathname(pathname);
  const firstSegment = normalized.split("/")[1];
  const locale = isAppLocale(firstSegment) ? firstSegment : null;
  const unlocalized = locale
    ? normalizePathname(normalized.slice(locale.length + 1) || "/")
    : normalized;
  const route = builtInGameRoutes.find((candidate) => candidate.legacyPaths.includes(unlocalized));
  return route ? { locale, playPath: route.playPath } : null;
}
