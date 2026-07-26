import type { Metadata } from "next";
import release from "../../../config/app-release.json";
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
      <body style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1 }}>{children}</div>
        <footer style={{ padding: "12px 20px", textAlign: "right", fontSize: 11, opacity: 0.6 }}>
          Game Fields SDK v{release.version}
        </footer>
      </body>
    </html>
  );
}
