import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SpectatorRoomClient } from "@/app/spectate/SpectatorRoomClient";
import { normalizeOnlineRoomCode } from "@/lib/online-room-realtime-protocol";
import { parseOnlineRoomSpectatorGame } from "@/lib/online-room-spectator-registry";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SpectatorRoomPage({ params }: { params: Promise<{ game: string; code: string }> }) {
  const value = await params;
  const game = parseOnlineRoomSpectatorGame(value.game);
  const code = normalizeOnlineRoomCode(value.code);
  if (!game || !code) notFound();
  return <SpectatorRoomClient game={game} code={code} />;
}
