import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sdk.game-fields.com"),
  title: {
    default: "Game Fields SDK",
    template: "%s | Game Fields SDK",
  },
  description:
    "Game Fields向けのゲームを安全に開発・検証・提出するためのSDKと開発者向け資料。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
