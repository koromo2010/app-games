import type { Metadata } from "next";
import { UserDashboard } from "./UserDashboard";

export const metadata: Metadata = {
  title: "マイページ | Game Fields",
  description: "Game Fieldsの戦績、プレイバック、お気に入りを確認します。",
};

export default function UserPage() {
  return <UserDashboard />;
}
