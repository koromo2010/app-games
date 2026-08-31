import { createHash } from "node:crypto";
import { resolveGameFieldsEnvironment } from "@/lib/game-fields-environment";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import {
  canonicalRoomInviteEndpoint,
  canonicalRoomInviteHref,
  revalidateCanonicalRoomInviteTarget,
} from "@/lib/room-invite-provider";
import { loadCanonicalRoomInvite } from "@/lib/room-invite-store";

export const dynamic = "force-dynamic";

function forwardHeaders(request: Request, includeJson = false) {
  return {
    ...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie")! } : {}),
    ...(includeJson ? { "content-type": "application/json" } : {}),
  };
}

async function targetFor(inviteRef: string) {
  const environment = resolveGameFieldsEnvironment();
  const target = await loadCanonicalRoomInvite(environment, inviteRef)
    ?? await loadCanonicalRoomInvite("candidate-preview", inviteRef);
  if (!target || !(await revalidateCanonicalRoomInviteTarget(target))) return null;
  return target;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ roomCode: string }> },
) {
  try {
    await requireAuthenticatedPlayer();
    const { roomCode: inviteRef } = await context.params;
    const target = await targetFor(inviteRef);
    if (!target) return Response.json({ error: "ROOM_INVITE_NOT_FOUND" }, { status: 404 });
    return Response.json({ invite: {
      inviteRef: target.inviteRef,
      displayCode: target.displayCode,
      contentLanguage: target.contentLanguage,
      expiresAt: target.expiresAt,
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ROOM_INVITE_LOOKUP_FAILED";
    return Response.json({ error: code }, { status: code === "PLAYER_AUTH_REQUIRED" ? 401 : 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomCode: string }> },
) {
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const { roomCode: inviteRef } = await context.params;
    const target = await targetFor(inviteRef);
    if (!target) return Response.json({ error: "ROOM_INVITE_NOT_FOUND" }, { status: 404 });
    const input = await request.json().catch(() => ({})) as { passphrase?: unknown };
    const endpoint = new URL(canonicalRoomInviteEndpoint(target), request.url);
    let expectedRevision: number | undefined;
    const sdk = target.providerKind === "sdk-approved" || target.providerKind === "sdk-preview";
    if (sdk) {
      endpoint.searchParams.set("code", target.displayCode);
      const current = await fetch(endpoint, { headers: forwardHeaders(request), cache: "no-store" });
      const payload = await current.json().catch(() => ({})) as { room?: { revision?: unknown } };
      if (!current.ok || !Number.isSafeInteger(payload.room?.revision)) {
        return Response.json({ error: "ROOM_INVITE_TARGET_NOT_FOUND" }, { status: 409 });
      }
      expectedRevision = Number(payload.room!.revision);
      endpoint.searchParams.delete("code");
    }
    if (!(await revalidateCanonicalRoomInviteTarget(target))) {
      return Response.json({ error: "ROOM_INVITE_TARGET_CHANGED" }, { status: 409 });
    }
    const canvas = target.providerKind === "canvas";
    const commandId = `invite-${createHash("sha256")
      .update(`${target.inviteRef}:${session.id}`)
      .digest("hex").slice(0, 32)}`;
    const joined = await fetch(endpoint, {
      method: "PATCH",
      headers: forwardHeaders(request, true),
      body: JSON.stringify(sdk ? {
        code: target.displayCode,
        envelope: {
          commandId,
          expectedRevision,
          expectedRoomInstanceId: target.roomInstanceId,
          command: { type: "room/join" },
        },
      } : canvas ? {
        code: target.displayCode,
        expectedRoomInstanceId: target.roomInstanceId,
        action: {
          type: "join",
          passphrase: typeof input.passphrase === "string" ? input.passphrase : "",
        },
      } : {
        code: target.displayCode,
        expectedRoomInstanceId: target.roomInstanceId,
        contentLanguage: target.contentLanguage,
        action: {
          type: "join-room",
          passphrase: typeof input.passphrase === "string" ? input.passphrase : "",
          contentLanguage: target.contentLanguage,
        },
      }),
      cache: "no-store",
    });
    const payload = await joined.json().catch(() => ({}));
    if (!joined.ok) return Response.json(payload, { status: joined.status });
    return Response.json({ ok: true, href: canonicalRoomInviteHref(target) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ROOM_INVITE_JOIN_FAILED";
    return Response.json({ error: code }, { status: code === "PLAYER_AUTH_REQUIRED" ? 401 : 400 });
  }
}
