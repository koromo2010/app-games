"use client";

import { CanvasDesktopLayout } from "./CanvasDesktopLayout";
import { useCanvasController } from "./use-canvas-controller";
import { CommonRoomChatMount } from "@/app/components/room-chat/CommonRoomChatMount";

export function CanvasGame() {
  const controller = useCanvasController();
  return <><CanvasDesktopLayout controller={controller} /><CommonRoomChatMount game="canvas" room={controller.state.room} /></>;
}
