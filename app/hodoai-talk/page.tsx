import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { privateGameCookieMatches, privateGameCookieName } from "@/lib/private-game-access";
import { HodoaiTalkGame } from "./HodoaiTalkGame";

export const metadata: Metadata = {
  title: "ほどあいトーク | Game Fields",
  description: "言葉の手がかりを感覚の順に並べる、個人利用向けのオリジナル会話ゲーム。",
};

export default async function HodoaiTalkPage() {
  const store = await cookies();
  if (!privateGameCookieMatches(store.get(privateGameCookieName)?.value)) redirect("/games");
  return <HodoaiTalkGame />;
}
