import type { Metadata } from "next";
import { loadPublicGameDisplayMetadata } from "@/lib/game-display-metadata-server";
import { UserDashboard } from "./UserDashboard";

export const metadata: Metadata = {
  title: "マイページ | Game Fields",
  description: "Game Fieldsの戦績、プレイバック、お気に入りを確認します。",
};

export default async function UserPage() {
  const gameDisplayMetadata = await loadPublicGameDisplayMetadata();
  return <UserDashboard gameDisplayMetadata={gameDisplayMetadata} />;
}
