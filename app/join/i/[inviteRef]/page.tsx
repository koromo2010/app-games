import { notFound } from "next/navigation";
import { PlayerAuthGate } from "@/app/components/PlayerAuthGate";
import { getAuthenticatedPlayer } from "@/lib/player-auth";
import { CanonicalInviteJoiner } from "./CanonicalInviteJoiner";

export const dynamic = "force-dynamic";

export default async function CanonicalInvitePage({ params }: { params: Promise<{ inviteRef: string }> }) {
  const { inviteRef } = await params;
  if (!/^[a-f0-9]{32}$/.test(inviteRef)) notFound();
  if (!(await getAuthenticatedPlayer())) return <PlayerAuthGate title="招待された部屋に参加" />;
  return <CanonicalInviteJoiner inviteRef={inviteRef} />;
}
