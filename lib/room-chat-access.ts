import { productionOnlineRoomRealtimeAuthorizationDriver } from "./online-room-realtime-provider.ts";
import type { RoomChatTarget } from "./room-chat-contract.ts";
import { roomChatEnabled } from "./room-chat-policy.ts";

export type RoomChatAccess = RoomChatTarget & {
  actorId: string;
  environment: "development" | "test";
  expiresAt: number;
};

export async function resolveRoomChatAccess(actorId: string, expected: RoomChatTarget): Promise<RoomChatAccess | null> {
  const target = await productionOnlineRoomRealtimeAuthorizationDriver.resolve({
    actorId,
    game: expected.game,
    code: expected.code,
    role: "participant",
  });
  if (!target || target.role !== "participant" || target.roomInstanceId !== expected.roomInstanceId || !roomChatEnabled(target.environment)) return null;
  if ((target.roomExpiresAt ?? 0) <= Date.now()) return null;
  return {
    ...expected,
    actorId,
    environment: target.environment as "development" | "test",
    expiresAt: target.roomExpiresAt!,
  };
}
