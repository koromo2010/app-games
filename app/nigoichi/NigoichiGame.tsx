"use client";

import { NigoichiDesktopLayout } from "./NigoichiDesktopLayout";
import { useNigoichiController } from "./use-nigoichi-controller";
import { CommonRoomChatMount } from "@/app/components/room-chat/CommonRoomChatMount";

export function NigoichiGame() {
  const controller = useNigoichiController();
  return <><NigoichiDesktopLayout controller={controller} /><CommonRoomChatMount game="nigoichi" room={controller.state.room} /></>;
}
