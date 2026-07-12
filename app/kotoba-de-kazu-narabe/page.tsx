import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HodoaiTalkGame } from "@/app/hodoai-talk/HodoaiTalkGame";
import { privateGameCookieMatches, privateGameCookieName } from "@/lib/private-game-access";

export const metadata: Metadata = {
  title: "ことばで数ならべ | Game Fields",
  description: "秘密の数字を言葉で表し、みんなで小さい順に並べる協力ゲーム。",
};

export default async function KotobaDeKazuNarabePage() {
  const store = await cookies();
  if (!privateGameCookieMatches(store.get(privateGameCookieName)?.value)) redirect("/games");
  return <HodoaiTalkGame />;
}
