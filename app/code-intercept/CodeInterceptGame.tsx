"use client";

import { CodeInterceptDesktopLayout } from "./CodeInterceptDesktopLayout";
import { useCodeInterceptController } from "./use-code-intercept-controller";
import { CommonRoomChatMount } from "@/app/components/room-chat/CommonRoomChatMount";

export function CodeInterceptGame() {
  const controller = useCodeInterceptController();
  return <><CodeInterceptDesktopLayout controller={controller} /><CommonRoomChatMount game="code-intercept" room={controller.state.room} /></>;
}
