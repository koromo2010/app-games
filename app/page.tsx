import type { Metadata } from "next";
import { GameLobby } from "./games/GameLobby";

export const metadata: Metadata = {
  title: "オンラインゲーム広場",
  description: "友達と遊べるワードゲームや協力ゲームを選べるGAME FIELDSの広場です。",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <GameLobby />;
}
