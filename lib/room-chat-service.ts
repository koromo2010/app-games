import type { RoomChatTarget } from "./room-chat-contract.ts";
import type { RoomChatAccess } from "./room-chat-access.ts";
import { createRoomChatStore, roomChatScope, type RoomChatStoreDriver } from "./room-chat-store.ts";

export function createRoomChatService(options: {
  resolveAccess: (actorId: string, target: RoomChatTarget) => Promise<RoomChatAccess | null>;
  driver?: RoomChatStoreDriver;
  env?: NodeJS.ProcessEnv;
}) {
  const resolveAccess = options.resolveAccess;
  const store = createRoomChatStore(options.driver, options.env);
  return {
    async send(actorId: string, input: RoomChatTarget & { requestId: string; body: string }, now = Date.now()) {
      const access = await resolveAccess(actorId, input);
      if (!access) return { error: "ROOM_CHAT_MEMBERSHIP_REQUIRED" as const };
      const scope = roomChatScope(access.environment, access.game, access.roomInstanceId);
      return { message: await store.append({ scope, roomInstanceId: access.roomInstanceId, actorId, requestId: input.requestId, body: input.body, expiresAt: access.expiresAt, now }) };
    },
    async page(actorId: string, input: RoomChatTarget & { cursor?: unknown; limit?: number }) {
      const access = await resolveAccess(actorId, input);
      if (!access) return { error: "ROOM_CHAT_MEMBERSHIP_REQUIRED" as const };
      return store.page({ scope: roomChatScope(access.environment, access.game, access.roomInstanceId), roomInstanceId: access.roomInstanceId, cursor: input.cursor, limit: input.limit });
    },
  };
}
