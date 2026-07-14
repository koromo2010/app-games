import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KotobaSenpukuGame } from "@/app/kotoba-senpuku/KotobaSenpukuGame";
import { gamePageAccessAllowed } from "@/lib/game-access";

export const metadata: Metadata = {
  title: "ことばソナー | Game Fields",
  description: "秘密のことばを探知し、全文公開による脱落を避けて最後の1人を目指すオンラインゲーム。",
};

export default async function WordSonarPage() {
  if (!(await gamePageAccessAllowed("kotoba-senpuku"))) redirect("/games");
  return <KotobaSenpukuGame />;
}
