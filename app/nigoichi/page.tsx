import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { gamePageAccessAllowed } from "@/lib/game-access";
import { NigoichiGame } from "./NigoichiGame";

export const metadata: Metadata = {
  title: "ワードアウト | Game Fields",
  description: "みんなの連想を読み解き、誰にも配られていない言葉を見つけるオンラインゲーム。",
};

export default async function NigoichiPage() {
  if (!(await gamePageAccessAllowed("nigoichi"))) redirect("/games");
  return <NigoichiGame />;
}
