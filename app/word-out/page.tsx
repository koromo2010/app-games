import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NigoichiGame } from "@/app/nigoichi/NigoichiGame";
import { gamePageAccessAllowed } from "@/lib/game-access";

export const metadata: Metadata = {
  title: "ワードアウト | Game Fields",
  description: "みんなの連想を読み解き、誰にも配られていない言葉を探す。配る枚数を増やして難易度を変えられるオンラインゲーム。",
};

export default async function WordOutPage() {
  if (!(await gamePageAccessAllowed("nigoichi"))) redirect("/games");
  return <NigoichiGame />;
}
