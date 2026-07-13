import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { privateGameCookieMatches, privateGameCookieName } from "@/lib/private-game-access";
import { KotobaSenpukuGame } from "./KotobaSenpukuGame";

export const metadata: Metadata = {
  title: "ことば潜伏戦 | Game Fields",
  description: "秘密のことばへ文字スキャンをかけ、信号点を集める個人利用オンラインゲーム。",
};

export default async function KotobaSenpukuPage() {
  const store = await cookies();
  if (!privateGameCookieMatches(store.get(privateGameCookieName)?.value)) redirect("/games");
  return <KotobaSenpukuGame />;
}
