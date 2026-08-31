"use client";

import { CommonRoomChatShell } from "./CommonRoomChatShell";
import type { OnlineRoomRealtimeGame } from "@/lib/online-room-realtime-protocol";

export function CommonRoomChatMount({ game, room }: { game: OnlineRoomRealtimeGame; room: { code?: unknown } | null | undefined }) {
  return typeof room?.code === "string"
    ? <CommonRoomChatShell key={`${game}:${room.code}`} game={game} code={room.code} />
    : null;
}
