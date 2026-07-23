import type { TahoiyaRoom, TahoiyaRoomAction, TahoiyaRoomChoice } from "@/lib/tahoiya-types";
import { createOnlineRoomApiClient } from "@/lib/online-room-api-client";
import { withAiActivity } from "@/lib/ai-activity-client";

export const tahoiyaRoomApi = createOnlineRoomApiClient<TahoiyaRoom, TahoiyaRoomChoice>({
  endpoint: "/api/tahoiya/rooms",
});

export function createTahoiyaRoom(room: TahoiyaRoom, actorId: string) {
  return tahoiyaRoomApi.post<{ room: TahoiyaRoom; actorId: string }, { room?: TahoiyaRoom }>({ room, actorId });
}

export function applyTahoiyaRoomAction(code: string, action: TahoiyaRoomAction | { type: "join-room"; passphrase: string } | { type: "start-round" }) {
  return action.type === "start-round"
    ? withAiActivity("たほい屋のお題準備", () => tahoiyaRoomApi.patch(code, action))
    : tahoiyaRoomApi.patch(code, action);
}
