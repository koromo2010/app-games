"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import type { OnlineRoomRealtimeGame } from "@/lib/online-room-realtime-protocol";
import { gameTopMenuItemClass } from "./GameTopMenu";
import { useAppLocale } from "./AppLocaleProvider";

export function OnlineRoomSpectatorLink({ game, code }: { game: OnlineRoomRealtimeGame; code: string }) {
  const { t } = useAppLocale();
  return <Link href={`/spectate/${game}/${code}`} data-menu-close="true" className={gameTopMenuItemClass}>{t("game.spectate")}</Link>;
}
