import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { gamePageAccessAllowed } from "@/lib/game-access";
import { NigoichiGame } from "./NigoichiGame";

export const metadata: Metadata = {
  title: "ニゴイチ（モック） | Game Fields",
  description: "2つの単語から連想した言葉で、配られていない番号を推理するローカル試作。",
};

export default async function NigoichiPage() {
  if (!(await gamePageAccessAllowed("nigoichi"))) redirect("/games");
  return <NigoichiGame />;
}
