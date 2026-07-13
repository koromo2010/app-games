import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KotobaSenpukuGame } from "@/app/kotoba-senpuku/KotobaSenpukuGame";
import { privateGameCookieMatches, privateGameCookieName } from "@/lib/private-game-access";

export const metadata: Metadata = {
  title: "ことばソナー | Game Fields",
  description: "秘密のことばを探知し、全文公開による脱落を避けて最後の1人を目指すオンラインゲーム。",
};

export default async function WordSonarPage() {
  const store = await cookies();
  if (!privateGameCookieMatches(store.get(privateGameCookieName)?.value)) redirect("/games");
  return <KotobaSenpukuGame />;
}
