import {
  resolveApprovedSdkGamePresentation,
} from "../../../../../../config/sdk-game-presentations.ts";

export default async function CreatorGameLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ gameId: string }>;
}>) {
  const { gameId: rawGameId } = await params;
  const gameId = rawGameId.trim().toLowerCase();
  const presentation = resolveApprovedSdkGamePresentation({
    gameId,
    fallbackTitle: {
      ja: gameId,
      en: gameId,
    },
  });
  const appBaseUrl = process.env.GAME_FIELDS_PREVIEW_APP_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main"
      ? "https://www.game-fields.com"
      : "https://dev.game-fields.com");
  const visualSrc = `${appBaseUrl}${presentation.visual}`;

  return <>
    <div
      style={{
        background: "#101826",
        borderBottom: "1px solid rgba(148, 163, 184, 0.35)",
        padding: "16px clamp(16px, 4vw, 48px)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={`${presentation.title.ja}のゲームサムネイル`}
        fetchPriority="high"
        height={500}
        src={visualSrc}
        style={{
          borderRadius: 12,
          display: "block",
          height: "auto",
          margin: "0 auto",
          maxWidth: 1200,
          objectFit: "cover",
          width: "100%",
        }}
        width={1200}
      />
    </div>
    {children}
  </>;
}
