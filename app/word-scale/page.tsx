import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HodoaiTalkGame } from "@/app/hodoai-talk/HodoaiTalkGame";
import { gamePageAccessAllowed } from "@/lib/game-access";

export const metadata: Metadata = {
  title: "ワードスケール | Game Fields",
  description: "秘密の数字カードをことばで表し、みんなで小さい順に並べる協力ゲーム。",
};

export default async function WordScalePage() {
  if (!(await gamePageAccessAllowed("hodoai"))) redirect("/games");
  return <HodoaiTalkGame />;
}
