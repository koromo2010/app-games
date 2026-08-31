import { normalizeAppLocale, type AppLocale } from "./app-locale.ts";
import {
  builtInGameLocaleRegistration,
  builtInGameLocaleRegistry,
} from "./game-locale-registry.ts";

export type LanguageBoundGameId =
  | "wordwolf"
  | "tahoiya"
  | "hodoai"
  | "kotoba-senpuku"
  | "nigoichi"
  | "code-intercept";

export const languageBoundGameIds = Object.entries(builtInGameLocaleRegistry)
  .filter(([, registration]) => registration.policy.roomContentMode === "content-bound")
  .map(([gameId]) => gameId) as LanguageBoundGameId[];

export const gameContentLocales = Object.fromEntries(
  languageBoundGameIds.map((gameId) => [
    gameId,
    builtInGameLocaleRegistry[gameId].policy.contentLanguages,
  ]),
) as Record<LanguageBoundGameId, readonly AppLocale[]>;

export function isLanguageBoundGame(gameId: string): gameId is LanguageBoundGameId {
  return languageBoundGameIds.includes(gameId as LanguageBoundGameId);
}

export function normalizeRoomContentLocale(value: unknown): AppLocale {
  return normalizeAppLocale(value);
}

export function assertGameLocaleAvailable(gameId: LanguageBoundGameId, value: unknown) {
  const locale = normalizeAppLocale(value);
  if (!gameContentLocales[gameId].includes(locale)) throw new Error("GAME_LANGUAGE_UNAVAILABLE");
}

export function isGameLocaleAvailable(gameId: string, value: unknown) {
  return !isLanguageBoundGame(gameId) || gameContentLocales[gameId].includes(normalizeAppLocale(value));
}

export function isGameUiLocaleAvailable(gameId: string, value: unknown) {
  const locale = normalizeAppLocale(value);
  return builtInGameLocaleRegistration(gameId)?.policy.uiLocales.includes(locale) ?? locale === "ja";
}

export function gameSupportsCrossLocaleRooms(gameId: string) {
  const policy = builtInGameLocaleRegistration(gameId)?.policy;
  return policy?.roomContentMode === "neutral"
    && policy.uiLocales.includes("ja")
    && policy.uiLocales.includes("en");
}

export function assertRoomLanguageAccess(room: { contentLocale?: unknown }, playerLocale: unknown) {
  if (normalizeRoomContentLocale(room.contentLocale) !== normalizeAppLocale(playerLocale)) {
    throw new Error("ROOM_LANGUAGE_MISMATCH");
  }
}

export function assertRoomContentLanguageAccess(
  gameId: string,
  room: { contentLanguage?: unknown; contentLocale?: unknown },
  requestedContentLanguage: unknown,
) {
  const registration = builtInGameLocaleRegistration(gameId);
  if (!registration || registration.policy.roomContentMode === "neutral") return;
  const roomLanguage = roomContentLanguage(room, gameId);
  const requested = normalizeAppLocale(requestedContentLanguage);
  if (!registration.policy.contentLanguages?.includes(requested)) {
    throw new Error("GAME_LANGUAGE_UNAVAILABLE");
  }
  if (roomLanguage !== requested) throw new Error("ROOM_LANGUAGE_MISMATCH");
}

export function roomContentLanguage(room: { contentLanguage?: unknown; contentLocale?: unknown }, gameId: string): AppLocale | undefined {
  const registration = builtInGameLocaleRegistration(gameId);
  if (!registration || registration.policy.roomContentMode === "neutral") return undefined;
  return normalizeAppLocale(room.contentLanguage ?? room.contentLocale ?? registration.policy.defaultContentLanguage);
}

export function filterRoomChoicesByLocale<T extends { contentLocale?: unknown }>(rooms: T[], playerLocale: unknown) {
  const locale = normalizeAppLocale(playerLocale);
  return rooms.filter((room) => normalizeRoomContentLocale(room.contentLocale) === locale);
}

export function filterRoomPageByLocale<T extends { contentLocale?: unknown }>(
  page: { rooms: T[]; nextCursor?: string | null },
  playerLocale: unknown,
) {
  return { ...page, rooms: filterRoomChoicesByLocale(page.rooms, playerLocale) };
}

export function filterRoomPageByContentLanguage<T extends { contentLanguage?: unknown; contentLocale?: unknown }>(
  gameId: string,
  page: { rooms: T[]; nextCursor?: string | null },
  requestedContentLanguage: unknown,
) {
  const registration = builtInGameLocaleRegistration(gameId);
  if (!registration || registration.policy.roomContentMode === "neutral") return page;
  const requested = normalizeAppLocale(requestedContentLanguage);
  return {
    ...page,
    rooms: page.rooms.filter((room) => roomContentLanguage(room, gameId) === requested),
  };
}
