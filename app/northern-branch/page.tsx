import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { privateGameCookieMatches, privateGameCookieName } from "@/lib/private-game-access";
import { NorthernBranchGame } from "./NorthernBranchGame";

export const metadata: Metadata = {
  title: "ノーザンブランチ | Game Fields",
  description: "ログインしたプレイヤー同士で遊ぶ、個人利用枠のオンライン資源管理ゲーム。",
};

export default async function NorthernBranchPage() {
  const store = await cookies();
  if (!privateGameCookieMatches(store.get(privateGameCookieName)?.value)) redirect("/games");
  return <NorthernBranchGame />;
}
