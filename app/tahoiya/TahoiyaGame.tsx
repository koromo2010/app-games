"use client";

import { TahoiyaDesktopLayout } from "./TahoiyaDesktopLayout";
import { useTahoiyaController } from "./use-tahoiya-controller";
import { CommonRoomChatMount } from "@/app/components/room-chat/CommonRoomChatMount";

export function TahoiyaGame() {
  const controller = useTahoiyaController();
  return <><TahoiyaDesktopLayout controller={controller} /><CommonRoomChatMount game="tahoiya" room={controller.state.room} /></>;
}
