import type { Metadata } from "next";
import { NigoichiGame } from "@/app/nigoichi/NigoichiGame";

export const metadata: Metadata = {
  title: "ワードアウト | Game Fields",
  description: "みんなの連想を読み解き、誰にも配られていない言葉を探す。配る枚数を増やして難易度を変えられるオンラインゲーム。",
};

export default function WordOutPage() {
  return <NigoichiGame />;
}
