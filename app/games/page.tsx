import type { Metadata } from "next";
import { GameLobby } from "./GameLobby";

export const metadata: Metadata = {
  title: "Game Lobby | App Games",
  description: "Prototype game lobby for party games.",
};

export default function GameLobbyPage() {
  return <GameLobby />;
}
