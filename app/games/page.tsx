import type { Metadata } from "next";
import { GameLobby } from "./GameLobby";

export const metadata: Metadata = {
  title: "オンラインゲーム広場",
  description: "友達と遊べるワードゲームや協力ゲームを選べるGAME FIELDSの広場です。",
  alternates: { canonical: "/games" },
};

export default function GameLobbyPage() {
  return <GameLobby />;
}
