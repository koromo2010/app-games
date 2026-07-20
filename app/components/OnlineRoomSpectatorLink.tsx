import Link from "next/link";
import type { OnlineRoomRealtimeGame } from "@/lib/online-room-realtime-protocol";
import { gameTopMenuItemClass } from "./GameTopMenu";

export function OnlineRoomSpectatorLink({ game, code }: { game: OnlineRoomRealtimeGame; code: string }) {
  return <Link href={`/spectate/${game}/${code}`} data-menu-close="true" className={gameTopMenuItemClass}>観戦・共有設定</Link>;
}
