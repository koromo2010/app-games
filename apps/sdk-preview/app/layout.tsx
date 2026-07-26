import type { Metadata } from "next";
import release from "../../../config/app-release.json";
import "./styles.css";

export const metadata: Metadata = {
  title: "Game Fields isolated preview",
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <div
          aria-label={`Game Fields version ${release.version}`}
          style={{
            position: "fixed",
            right: 8,
            bottom: 6,
            zIndex: 2147483647,
            borderRadius: 999,
            background: "rgba(15, 23, 42, 0.78)",
            padding: "3px 7px",
            color: "rgba(255,255,255,.72)",
            fontSize: 10,
            lineHeight: 1.2,
            pointerEvents: "none",
          }}
        >
          v{release.version}
        </div>
      </body>
    </html>
  );
}
