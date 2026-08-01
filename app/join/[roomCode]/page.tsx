import { notFound } from "next/navigation";
import { PlayerAuthGate } from "@/app/components/PlayerAuthGate";
import { getAuthenticatedPlayer } from "@/lib/player-auth";
import { InviteRoomJoiner } from "./InviteRoomJoiner";

export const dynamic = "force-dynamic";

const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,12}$/;

export default async function InviteRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode: rawRoomCode } = await params;
  const roomCode = rawRoomCode.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(roomCode)) notFound();

  const player = await getAuthenticatedPlayer();
  if (!player) {
    return <PlayerAuthGate title={`部屋 ${roomCode} に参加`} />;
  }

  return <InviteRoomJoiner roomCode={roomCode} player={player} />;
}
