import type { DaifugoRoomAction, DaifugoRoomChoice, DaifugoRoomView } from "@/lib/daifugo-room";
import { createOnlineRoomApiClient } from "@/lib/online-room-api-client";

export const daifugoRoomApi = createOnlineRoomApiClient<DaifugoRoomView, DaifugoRoomChoice>({
  endpoint: "/api/daifugo/rooms",
});

export function createDaifugoRoom(room: DaifugoRoomView, actorId: string) {
  return daifugoRoomApi.post<{ room: DaifugoRoomView; actorId: string }, { room: DaifugoRoomView }>({ room, actorId });
}

export function applyDaifugoRoomAction(code: string, action: DaifugoRoomAction) {
  return daifugoRoomApi.patch(code, action);
}
