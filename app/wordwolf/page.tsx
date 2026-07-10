import type { Metadata } from "next";
import { WordWolfGame } from "./WordWolfGame";

export const metadata: Metadata = {
  title: "Wordwolf Lounge | App Games",
  description: "A prototype room-based wordwolf game.",
};

export default function WordWolfPage() {
  return <WordWolfGame />;
}

