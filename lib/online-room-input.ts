import { normalizeAppLocale } from "./app-locale.ts";
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

export function authenticatedRoomDraft(value: unknown, session: PlayerSession & { id: string }) {
  if (!value || typeof value !== "object") return value;
  const draft = value as Record<string, unknown>;
  return {
    ...draft,
    hostId: session.id,
    contentLocale: normalizeAppLocale(session.locale),
    players: [authenticatedRoomPlayer(session)],
    passphrase: typeof draft.passphrase === "string"
      ? draft.passphrase.trim().slice(0, onlineRoomPassphraseMaximumLength)
      : "",
  };
}
