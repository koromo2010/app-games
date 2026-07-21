import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Game Fields isolated preview",
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
