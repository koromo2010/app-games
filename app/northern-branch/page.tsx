import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { privateGameCookieMatches, privateGameCookieName } from "@/lib/private-game-access";
import { NorthernBranchGame } from "./NorthernBranchGame";

export const metadata: Metadata = {
  title: "Northern Branch Prototype | App Games",
  description: "A private-use resource management game prototype.",
};

export default async function NorthernBranchPage() {
  const store = await cookies();
  if (!privateGameCookieMatches(store.get(privateGameCookieName)?.value)) redirect("/games");
  return <NorthernBranchGame />;
}
