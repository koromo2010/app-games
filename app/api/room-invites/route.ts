import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { resolveCanonicalRoomInviteTarget } from "@/lib/room-invite-provider";
import { issueCanonicalRoomInvite } from "@/lib/room-invite-store";
import type { CanonicalRoomInviteProviderKind } from "@/lib/room-invite-target";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const body = await request.json() as Record<string, unknown>;
    const providerKind = String(body.providerKind ?? "") as CanonicalRoomInviteProviderKind;
    if (!["built-in", "canvas", "sdk-approved", "sdk-preview"].includes(providerKind)) {
      return Response.json({ error: "ROOM_INVITE_PROVIDER_INVALID" }, { status: 400 });
    }
    const target = await resolveCanonicalRoomInviteTarget({
      providerKind,
      gameNamespace: String(body.gameNamespace ?? "").trim().toLowerCase(),
      displayCode: String(body.displayCode ?? "").trim(),
      sourceCreatorSlug: typeof body.sourceCreatorSlug === "string" ? body.sourceCreatorSlug.trim() : undefined,
      sourceGameId: typeof body.sourceGameId === "string" ? body.sourceGameId.trim() : undefined,
      packageRevision: typeof body.packageRevision === "string" ? body.packageRevision.trim() : undefined,
    }, session.id);
    if (!target) return Response.json({ error: "ROOM_INVITE_TARGET_NOT_FOUND" }, { status: 404 });
    const issued = await issueCanonicalRoomInvite(target);
    return Response.json({
      inviteRef: issued.target.inviteRef,
      href: `/join/i/${issued.target.inviteRef}`,
      expiresAt: issued.target.expiresAt,
      refreshed: !issued.created,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ROOM_INVITE_ISSUE_FAILED";
    return Response.json({ error: code }, {
      status: code === "PLAYER_AUTH_REQUIRED" ? 401 : code.includes("CONFLICT") ? 409 : 400,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
