"use client";

import { NorthernBranchDesktopLayout } from "./NorthernBranchDesktopLayout";
import { useNorthernBranchController } from "./use-northern-branch-controller";
import { CommonRoomChatMount } from "@/app/components/room-chat/CommonRoomChatMount";

export function NorthernBranchGame() {
  const controller = useNorthernBranchController();
  return <><NorthernBranchDesktopLayout controller={controller} /><CommonRoomChatMount game="northern-branch" room={controller.state.room} /></>;
}
