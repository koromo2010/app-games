import { isAvatarColor, isAvatarImage, normalizePlayerName, type PlayerSession } from "@/lib/player-session";
export { normalizeOnlineRoomCode, onlineRoomPassphraseMaximumLength } from "@/lib/online-room-policy";
import { onlineRoomPassphraseMaximumLength } from "@/lib/online-room-policy";

export function authenticatedRoomDraft(value: unknown, session: PlayerSession & { id: string }) {
  if (!value || typeof value !== "object") return value;
  const draft = value as Record<string, unknown>;
  return {
    ...draft,
    hostId: session.id,
    players: [{
      id: session.id,
      name: normalizePlayerName(session.name),
      joinedAt: Date.now(),
      avatarColor: isAvatarColor(session.avatarColor) ? session.avatarColor : undefined,
      avatarImage: isAvatarImage(session.avatarImage) ? session.avatarImage : undefined,
      shareNameAllowed: session.shareNameAllowed === true,
    }],
    passphrase: typeof draft.passphrase === "string"
      ? draft.passphrase.trim().slice(0, onlineRoomPassphraseMaximumLength)
      : "",
  };
}
