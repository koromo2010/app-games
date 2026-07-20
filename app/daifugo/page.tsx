import type { Metadata } from "next";
import { DaifugoGame } from "./DaifugoGame";

export const metadata: Metadata = {
  title: "大富豪 | Game Fields",
  description: "3〜6人のオンライン対戦と1人用CPU練習で遊べる大富豪。",
  alternates: { canonical: "/daifugo" },
};

export default function DaifugoPage() {
  return <DaifugoGame />;
}
