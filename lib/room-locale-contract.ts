import type { AppLocale } from "./app-locale.ts";

export type StableRoomIdentity = Readonly<{
  gameId: string;
  code: string;
  revision: number;
  environment?: string;
  packageRevision?: string;
}>;

/** UI/content locale is deliberately not accepted as an identity input. */
export function stableRoomIdentity(input: StableRoomIdentity) {
  return [
    input.environment ?? "platform",
    input.gameId,
    input.packageRevision ?? "built-in",
    input.code.trim().toUpperCase(),
    String(input.revision),
  ].join(":");
}

export type SemanticRoomEvent = Readonly<{
  code: string;
  params?: Readonly<Record<string, string | number>>;
}>;

const semanticEventLabels: Record<string, Record<AppLocale, string>> = {
  "room.joined": { ja: "参加しました", en: "Joined the room" },
  "room.left": { ja: "退出しました", en: "Left the room" },
  "game.completed": { ja: "ゲーム終了", en: "Game completed" },
};

export function presentSemanticRoomEvent(event: SemanticRoomEvent, locale: AppLocale) {
  const label = semanticEventLabels[event.code]?.[locale] ?? event.code;
  return Object.entries(event.params ?? {}).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    label,
  );
}
