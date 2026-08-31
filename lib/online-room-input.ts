import { normalizeAppLocale } from "./app-locale.ts";
import { builtInGameLocaleRegistration } from "./game-locale-registry.ts";
import { onlineRoomPassphraseMaximumLength } from "./online-room-policy.ts";
import { isAvatarColor, isAvatarImage, normalizePlayerName, type PlayerSession } from "./player-session.ts";
export { normalizeOnlineRoomCode, onlineRoomPassphraseMaximumLength } from "./online-room-policy.ts";

export function authenticatedRoomPlayer(session: PlayerSession & { id: string }) {
  return {
    id: session.id,
    name: normalizePlayerName(session.name),
    joinedAt: Date.now(),
    avatarColor: isAvatarColor(session.avatarColor) ? session.avatarColor : undefined,
    avatarImage: isAvatarImage(session.avatarImage) ? session.avatarImage : undefined,
    shareNameAllowed: session.shareNameAllowed === true,
  };
}

export function authenticatedRoomDraft(
  value: unknown,
  session: PlayerSession & { id: string },
  gameId?: string,
) {
  if (!value || typeof value !== "object") return value;
  const draft = value as Record<string, unknown>;
  const policy = gameId ? builtInGameLocaleRegistration(gameId)?.policy : undefined;
  const contentLanguage = normalizeAppLocale(
    gameId
      ? draft.contentLanguage ?? draft.contentLocale ?? session.locale
      : session.locale,
  );
  if (
    policy?.roomContentMode === "content-bound"
    && !policy.contentLanguages?.includes(contentLanguage)
  ) throw new Error("GAME_LANGUAGE_UNAVAILABLE");
  return {
    ...draft,
    hostId: session.id,
    ...(policy?.roomContentMode === "neutral" ? {
      contentLocale: undefined,
      contentLanguage: undefined,
    } : {
      contentLocale: contentLanguage,
      contentLanguage,
    }),
    players: [authenticatedRoomPlayer(session)],
    passphrase: typeof draft.passphrase === "string"
      ? draft.passphrase.trim().slice(0, onlineRoomPassphraseMaximumLength)
      : "",
  };
}
