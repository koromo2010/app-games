import gameRegistry from "../config/game-registry.json" with { type: "json" };
import type { AppLocale } from "./app-locale.ts";

export type GameRoomContentMode = "neutral" | "content-bound";

export type GameLocalePolicy = Readonly<{
  roomContentMode: GameRoomContentMode;
  uiLocales: readonly AppLocale[];
  contentLanguages?: readonly AppLocale[];
  defaultContentLanguage?: AppLocale;
}>;

export type BuiltInGameLocaleRegistration = Readonly<{
  policy: GameLocalePolicy;
  onlineRoomProvider: "common" | "prototype";
}>;

const registrations = {
  wordwolf: { policy: { roomContentMode: "content-bound", uiLocales: ["ja"], contentLanguages: ["ja"], defaultContentLanguage: "ja" }, onlineRoomProvider: "common" },
  tahoiya: { policy: { roomContentMode: "content-bound", uiLocales: ["ja"], contentLanguages: ["ja"], defaultContentLanguage: "ja" }, onlineRoomProvider: "common" },
  "northern-branch": { policy: { roomContentMode: "neutral", uiLocales: ["ja"] }, onlineRoomProvider: "common" },
  hodoai: { policy: { roomContentMode: "content-bound", uiLocales: ["ja"], contentLanguages: ["ja"], defaultContentLanguage: "ja" }, onlineRoomProvider: "common" },
  "kotoba-senpuku": { policy: { roomContentMode: "content-bound", uiLocales: ["ja"], contentLanguages: ["ja"], defaultContentLanguage: "ja" }, onlineRoomProvider: "common" },
  nigoichi: { policy: { roomContentMode: "content-bound", uiLocales: ["ja"], contentLanguages: ["ja"], defaultContentLanguage: "ja" }, onlineRoomProvider: "common" },
  "code-intercept": { policy: { roomContentMode: "content-bound", uiLocales: ["ja"], contentLanguages: ["ja"], defaultContentLanguage: "ja" }, onlineRoomProvider: "common" },
  canvas: { policy: { roomContentMode: "neutral", uiLocales: ["ja"] }, onlineRoomProvider: "prototype" },
  daifugo: { policy: { roomContentMode: "neutral", uiLocales: ["ja", "en"] }, onlineRoomProvider: "common" },
} as const satisfies Record<string, BuiltInGameLocaleRegistration>;

export type BuiltInGameId = keyof typeof registrations;

function validatePolicy(gameId: string, policy: GameLocalePolicy) {
  const uniqueUiLocales = new Set(policy.uiLocales);
  if (uniqueUiLocales.size === 0 || uniqueUiLocales.size !== policy.uiLocales.length) {
    throw new Error(`GAME_LOCALE_POLICY_INVALID:${gameId}:uiLocales`);
  }
  if (policy.roomContentMode === "neutral") {
    if (policy.contentLanguages !== undefined || policy.defaultContentLanguage !== undefined) {
      throw new Error(`GAME_LOCALE_POLICY_INVALID:${gameId}:neutral-content`);
    }
    return;
  }
  const languages = policy.contentLanguages ?? [];
  if (
    languages.length === 0
    || new Set(languages).size !== languages.length
    || !policy.defaultContentLanguage
    || !languages.includes(policy.defaultContentLanguage)
  ) throw new Error(`GAME_LOCALE_POLICY_INVALID:${gameId}:contentLanguages`);
}

const configuredIds = Object.keys(registrations).sort();
const registryIds = gameRegistry.map((game) => game.id).sort();
if (configuredIds.join("\n") !== registryIds.join("\n")) {
  throw new Error("GAME_LOCALE_REGISTRY_INCOMPLETE");
}
for (const [gameId, registration] of Object.entries(registrations)) {
  validatePolicy(gameId, registration.policy);
}

export const builtInGameLocaleRegistry: Readonly<Record<BuiltInGameId, BuiltInGameLocaleRegistration>> = registrations;

export const builtInCommonOnlineRoomGameIds = [
  "wordwolf", "tahoiya", "northern-branch", "hodoai",
  "kotoba-senpuku", "nigoichi", "code-intercept", "daifugo",
] as const satisfies readonly BuiltInGameId[];

const derivedCommonIds = configuredIds.filter((gameId) => (
  registrations[gameId as BuiltInGameId].onlineRoomProvider === "common"
));
if ([...builtInCommonOnlineRoomGameIds].sort().join("\n") !== derivedCommonIds.join("\n")) {
  throw new Error("GAME_ONLINE_ROOM_REGISTRY_INCOMPLETE");
}

export function builtInGameLocaleRegistration(gameId: string): BuiltInGameLocaleRegistration | null {
  return Object.prototype.hasOwnProperty.call(registrations, gameId)
    ? registrations[gameId as BuiltInGameId]
    : null;
}

export function builtInOnlineRoomGameIds(): BuiltInGameId[] {
  return [...builtInCommonOnlineRoomGameIds];
}
