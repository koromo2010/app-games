import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { gamePageAccessAllowed } from "@/lib/game-access";
import { NorthernBranchGame } from "./NorthernBranchGame";

export const metadata: Metadata = {
  title: "ノーザンブランチ | Game Fields",
  description: "ログインしたプレイヤー同士で遊ぶ、個人利用枠のオンライン資源管理ゲーム。",
};

export default async function NorthernBranchPage() {
  if (!(await gamePageAccessAllowed("northern-branch"))) redirect("/games");
  return <NorthernBranchGame />;
}
