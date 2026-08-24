import Image from "next/image";
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

  return <>
    <div
      style={{
        background: "#101826",
        borderBottom: "1px solid rgba(148, 163, 184, 0.35)",
        padding: "16px clamp(16px, 4vw, 48px)",
      }}
    >
      <Image
        alt={`${presentation.title.ja}のゲームサムネイル`}
        height={500}
        priority
        src={presentation.visual}
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
