import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "@/app/components/SiteFooter";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.game-fields.com"),
  applicationName: "GAME FIELDS",
  title: { default: "GAME FIELDS | 友達と遊べるオンラインパーティーゲーム", template: "%s | GAME FIELDS" },
  description: "ワードゲームや協力ゲームを、ブラウザから友達と遊べるオンラインゲーム広場。部屋を作って離れた相手ともすぐに遊べます。",
  openGraph: { type: "website", locale: "ja_JP", siteName: "GAME FIELDS", title: "GAME FIELDS", description: "友達と遊べるオンラインパーティーゲーム" },
  twitter: { card: "summary_large_image", title: "GAME FIELDS", description: "友達と遊べるオンラインパーティーゲーム" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}<SiteFooter /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "GAME FIELDS", alternateName: "ゲームフィールド", url: "https://www.game-fields.com/", description: "友達と遊べるオンラインパーティーゲーム" }) }} /></body>
    </html>
  );
}
