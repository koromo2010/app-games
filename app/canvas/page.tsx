import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CanvasGame } from "@/app/canvas/CanvasGame";
import { gamePageAccessAllowed } from "@/lib/game-access";

export const metadata: Metadata = { title: "キャンバス | Game Fields", description: "お絵描きゲーム用キャンバスUIの非公開プロトタイプ。" };

export default async function CanvasPage() {
  if (!(await gamePageAccessAllowed("canvas"))) redirect("/games");
  return <CanvasGame />;
}
