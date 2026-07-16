import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { gamePageAccessAllowed } from "@/lib/game-access";
import { TahoiyaGame } from "./TahoiyaGame";

export const metadata: Metadata = {
  title: "Tahoiya | App Games",
  description: "A prototype room-based dictionary bluffing game.",
};

export default async function TahoiyaPage() {
  if (!(await gamePageAccessAllowed("tahoiya"))) redirect("/games");
  return <TahoiyaGame />;
}
