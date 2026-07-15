import type { CodeInterceptRoom, CodeInterceptRoomAction, CodeInterceptRoomChoice } from "@/lib/code-intercept";
import { createOnlineRoomApiClient } from "@/lib/online-room-api-client";

export const codeInterceptRoomApi = createOnlineRoomApiClient<CodeInterceptRoom, CodeInterceptRoomChoice>({ endpoint: "/api/code-intercept/rooms" });

export function createCodeInterceptRoom(room: CodeInterceptRoom, actorId: string) {
  return codeInterceptRoomApi.post<{ room: CodeInterceptRoom; actorId: string }, { room: CodeInterceptRoom }>({ room, actorId });
}

export function applyCodeInterceptRoomAction(code: string, action: CodeInterceptRoomAction) {
  return codeInterceptRoomApi.patch(code, action);
}
