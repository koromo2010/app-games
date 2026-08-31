"use client";

import { KotobaSenpukuDesktopLayout } from "./KotobaSenpukuDesktopLayout";
import { useKotobaSenpukuController } from "./use-kotoba-senpuku-controller";
import { CommonRoomChatMount } from "@/app/components/room-chat/CommonRoomChatMount";

export function KotobaSenpukuGame() {
  const controller = useKotobaSenpukuController();
  return <><KotobaSenpukuDesktopLayout controller={controller} /><CommonRoomChatMount game="kotoba-senpuku" room={controller.state.room} /></>;
}
