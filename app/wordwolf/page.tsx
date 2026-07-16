import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { gamePageAccessAllowed } from "@/lib/game-access";
import { WordWolfGame } from "./WordWolfGame";

export const metadata: Metadata = {
  title: "Wordwolf Lounge | App Games",
  description: "A prototype room-based wordwolf game.",
};

export default async function WordWolfPage() {
  if (!(await gamePageAccessAllowed("wordwolf"))) redirect("/games");
  return <WordWolfGame />;
}
