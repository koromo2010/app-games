import type { NorthernRoom, NorthernRoomAction, NorthernRoomChoice } from "@/lib/northern-branch-types";
import { createOnlineRoomApiClient } from "@/lib/online-room-api-client";

export const northernBranchRoomApi = createOnlineRoomApiClient<NorthernRoom, NorthernRoomChoice>({
  endpoint: "/api/northern-branch/rooms",
});

export function saveNorthernBranchRoom(room: NorthernRoom, actorId: string) {
  return northernBranchRoomApi.post<{ room: NorthernRoom; actorId: string }, { room: NorthernRoom }>({ room, actorId });
}

export function applyNorthernBranchRoomAction(code: string, action: NorthernRoomAction) {
  return northernBranchRoomApi.patch(code, action);
}
