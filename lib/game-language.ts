import { normalizeAppLocale, type AppLocale } from "./app-locale.ts";

export const languageBoundGameIds = [
  "wordwolf",
  "tahoiya",
  "hodoai",
  "kotoba-senpuku",
  "nigoichi",
  "code-intercept",
] as const;

export type LanguageBoundGameId = (typeof languageBoundGameIds)[number];

// Add a locale here only after that game's word/theme/content sources support it.
export const gameContentLocales: Record<LanguageBoundGameId, readonly AppLocale[]> = {
  wordwolf: ["ja"],
  tahoiya: ["ja"],
  hodoai: ["ja"],
  "kotoba-senpuku": ["ja"],
  nigoichi: ["ja"],
  "code-intercept": ["ja"],
};

// Content-language compatibility and translated UI availability are separate.
// Non-language games may share rooms across locales even while their English UI is still rolling out.
const englishUiGameIds = new Set(["daifugo"]);

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
  return locale === "ja" || englishUiGameIds.has(gameId);
}

export function assertRoomLanguageAccess(room: { contentLocale?: unknown }, playerLocale: unknown) {
  if (normalizeRoomContentLocale(room.contentLocale) !== normalizeAppLocale(playerLocale)) {
    throw new Error("ROOM_LANGUAGE_MISMATCH");
  }
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
