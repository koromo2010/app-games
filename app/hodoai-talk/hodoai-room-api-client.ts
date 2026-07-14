import type { HodoaiRoom, HodoaiRoomAction, HodoaiRoomChoice } from "@/lib/hodoai-talk";
import { createOnlineRoomApiClient } from "@/lib/online-room-api-client";

export const hodoaiRoomApi = createOnlineRoomApiClient<HodoaiRoom, HodoaiRoomChoice>({
  endpoint: "/api/hodoai/rooms",
});

export function createHodoaiRoom(room: HodoaiRoom, actorId: string) {
  return hodoaiRoomApi.post<{ room: HodoaiRoom; actorId: string }, { room: HodoaiRoom }>({ room, actorId });
}

export function applyHodoaiRoomAction(code: string, action: HodoaiRoomAction) {
  return hodoaiRoomApi.patch(code, action);
}
