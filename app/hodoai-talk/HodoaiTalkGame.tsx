"use client";

import { HodoaiDesktopLayout } from "./HodoaiDesktopLayout";
import { useHodoaiController } from "./use-hodoai-controller";
import { CommonRoomChatMount } from "@/app/components/room-chat/CommonRoomChatMount";

export function HodoaiTalkGame() {
  const controller = useHodoaiController();
  return <><HodoaiDesktopLayout controller={controller} /><CommonRoomChatMount game="hodoai" room={controller.state.room} /></>;
}
