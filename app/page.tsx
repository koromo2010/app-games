import type { Metadata } from "next";
import { GameLobby } from "./games/GameLobby";

export const metadata: Metadata = {
  title: "Game Plaza | App Games",
  description: "Game plaza for choosing party games.",
};

export default function HomePage() {
  return <GameLobby />;
}
