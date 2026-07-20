import { DaifugoPracticeGame } from "@/app/daifugo/DaifugoPractice";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "大富豪・CPU練習 | Game Fields",
  description: "1人とCPU3人で基本ルールを練習できる大富豪。",
  alternates: { canonical: "/daifugo/practice" },
};

export default function DaifugoPracticePage() {
  return <DaifugoPracticeGame />;
}
