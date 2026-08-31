"use client";

import { DaifugoDesktopLayout } from "./DaifugoDesktopLayout";
import { useDaifugoController } from "./use-daifugo-controller";
import { CommonRoomChatMount } from "@/app/components/room-chat/CommonRoomChatMount";

export function DaifugoGame() {
  const controller = useDaifugoController();
  return <><DaifugoDesktopLayout controller={controller} /><CommonRoomChatMount game="daifugo" room={controller.state.room} /></>;
}
