import type { KotobaSenpukuRoom, KotobaSenpukuRoomAction, KotobaSenpukuRoomChoice } from "@/lib/kotoba-senpuku";
import { createOnlineRoomApiClient } from "@/lib/online-room-api-client";

export const kotobaSenpukuRoomApi = createOnlineRoomApiClient<KotobaSenpukuRoom, KotobaSenpukuRoomChoice>({
  endpoint: "/api/kotoba-senpuku/rooms",
});

export function createKotobaSenpukuRoom(room: KotobaSenpukuRoom, actorId: string) {
  return kotobaSenpukuRoomApi.post<{ room: KotobaSenpukuRoom; actorId: string }, { room: KotobaSenpukuRoom }>({ room, actorId });
}

export function applyKotobaSenpukuRoomAction(code: string, action: KotobaSenpukuRoomAction) {
  return kotobaSenpukuRoomApi.patch(code, action);
}
