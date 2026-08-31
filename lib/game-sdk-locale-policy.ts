import {
  gameSdkManifestSupportsCrossLocaleRooms,
  type GameSdkLocale,
  type GameSdkLocalePolicy,
  type GameSdkManifest,
} from "@game-fields/game-sdk";

export const productionApprovedSdkLocaleInventory = [
  "ai-word-guess", "ciao-ciao", "coyote", "fish-length-chicken-race",
  "link-lines", "new-pictures", "oogiri-game", "pictures", "skull", "twixt-repro",
] as const;

export type GameSdkLocaleDisposition =
  | "neutral"
  | "content-bound"
  | "evidence-insufficient";

export function gameSdkLocaleDisposition(
  manifest: Pick<GameSdkManifest, "localePolicy">,
): GameSdkLocaleDisposition {
  return manifest.localePolicy?.roomContentMode ?? "evidence-insufficient";
}

export function gameSdkCrossLocaleEligible(
  manifest: Pick<GameSdkManifest, "localePolicy">,
) {
  return gameSdkManifestSupportsCrossLocaleRooms(manifest);
}

export function assertGameSdkRoomContentLanguage(
  policy: GameSdkLocalePolicy | undefined,
  roomContentLanguage: unknown,
  requestedContentLanguage: unknown,
) {
  if (!policy || policy.roomContentMode === "neutral") return;
  const requested = typeof requestedContentLanguage === "string"
    ? requestedContentLanguage as GameSdkLocale
    : policy.defaultContentLanguage;
  const roomLanguage = typeof roomContentLanguage === "string"
    ? roomContentLanguage as GameSdkLocale
    : policy.defaultContentLanguage;
  if (!requested || !policy.contentLanguages?.includes(requested)) {
    throw new Error("GAME_SDK_CONTENT_LANGUAGE_UNAVAILABLE");
  }
  if (requested !== roomLanguage) throw new Error("GAME_SDK_ROOM_LANGUAGE_MISMATCH");
}

export function gameSdkPresentationContext(uiLocale: GameSdkLocale) {
  return Object.freeze({ uiLocale });
}
