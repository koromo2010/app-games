"use client";

import { WordWolfDesktopLayout } from "./WordWolfDesktopLayout";
import { useWordWolfController } from "./use-wordwolf-controller";
import { CommonRoomChatMount } from "@/app/components/room-chat/CommonRoomChatMount";

export function WordWolfGame() {
  const controller = useWordWolfController();
  return <><WordWolfDesktopLayout controller={controller} /><CommonRoomChatMount game="wordwolf" room={controller.state.room} /></>;
}
