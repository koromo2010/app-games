import type { NigoichiRoom, NigoichiRoomAction, NigoichiRoomChoice } from "@/lib/nigoichi";
import { createOnlineRoomApiClient } from "@/lib/online-room-api-client";

export const nigoichiRoomApi = createOnlineRoomApiClient<NigoichiRoom, NigoichiRoomChoice>({
  endpoint: "/api/nigoichi/rooms",
});

export function createNigoichiRoom(room: NigoichiRoom, actorId: string) {
  return nigoichiRoomApi.post<{ room: NigoichiRoom; actorId: string }, { room: NigoichiRoom }>({ room, actorId });
}

export function applyNigoichiRoomAction(code: string, action: NigoichiRoomAction) {
  return nigoichiRoomApi.patch(code, action);
}
