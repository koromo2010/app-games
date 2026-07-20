import { cookies } from "next/headers";
import { conditionalVersionedJsonResponse } from "@/lib/conditional-json";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { normalizeOnlineRoomCode } from "@/lib/online-room-realtime-protocol";
import {
  createOnlineRoomSpectatorGrant,
  onlineRoomSpectatorCookieName,
  onlineRoomSpectatorGrantMaxAgeSeconds,
  parseOnlineRoomSpectatorGrant,
} from "@/lib/online-room-spectator-auth";
import {
  loadOnlineRoomForSpectator,
  onlineRoomSpectatorSnapshot,
  parseOnlineRoomSpectatorGame,
} from "@/lib/online-room-spectator-registry";
import { loadOnlineRoomSpectatorPolicy, saveOnlineRoomSpectatorPolicy } from "@/lib/online-room-spectator-store";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { publishOnlineRoomRevision } from "@/lib/online-room-realtime-server";
import { assertRoomLanguageAccess, isLanguageBoundGame } from "@/lib/game-language";

function requestTarget(request: Request) {
  const url = new URL(request.url);
  return {
    game: parseOnlineRoomSpectatorGame(url.searchParams.get("game")),
    code: normalizeOnlineRoomCode(url.searchParams.get("code")),
  };
}

function invalidTarget() {
  return Response.json({ error: "Valid game and room code are required" }, { status: 400 });
}

async function loadTarget(request: Request, input?: { game?: unknown; code?: unknown }) {
  const target = input
    ? { game: parseOnlineRoomSpectatorGame(input.game), code: normalizeOnlineRoomCode(input.code) }
    : requestTarget(request);
  const game = target.game;
  const code = target.code;
  if (!game || !code) return { response: invalidTarget() } as const;
  const accessDenied = await gameApiAccessDeniedResponse(game);
  if (accessDenied) return { response: accessDenied } as const;
  const room = await loadOnlineRoomForSpectator(game, code);
  if (!room) return { response: Response.json({ error: "Room not found" }, { status: 404 }) } as const;
  return { game, code, room } as const;
}

function sameGrant(grant: ReturnType<typeof parseOnlineRoomSpectatorGrant>, input: { game: string; code: string; playerId: string; roomCreatedAt: number }) {
  return Boolean(grant && grant.game === input.game && grant.code === input.code && grant.playerId === input.playerId && grant.roomCreatedAt === input.roomCreatedAt);
}

export async function GET(request: Request) {
  try {
    const player = await requireAuthenticatedPlayer();
    const playerId = player.id;
    const target = await loadTarget(request);
    if ("response" in target) return target.response;
    if (isLanguageBoundGame(target.game)) assertRoomLanguageAccess(target.room, player.locale);
    const policy = await loadOnlineRoomSpectatorPolicy(target.game, target.code, target.room.createdAt);
    const isHost = target.room.hostId === playerId;
    const isParticipant = target.room.players.some((player) => player.id === playerId);
    const cookieStore = await cookies();
    const grant = parseOnlineRoomSpectatorGrant(cookieStore.get(onlineRoomSpectatorCookieName)?.value ?? "");
    const granted = sameGrant(grant, { game: target.game, code: target.code, playerId, roomCreatedAt: target.room.createdAt });
    if (!isHost && !isParticipant && (!policy.enabled || !granted)) return Response.json({ error: "Spectator access is not allowed" }, { status: 403 });
    const access = { enabled: policy.enabled, canManage: isHost, requiresPassphrase: Boolean(target.room.passphrase) };
    return conditionalVersionedJsonResponse(
      request,
      `spectator:${target.game}:${target.code}:${target.room.revision}:${policy.updatedAt}:${isHost ? 1 : 0}`,
      () => ({ snapshot: onlineRoomSpectatorSnapshot(target.game, target.room), access }),
    );
  } catch (error) {
    return commonOnlineRoomErrorResponse(error) ?? Response.json({ error: "Failed to load spectator view" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const player = await requireAuthenticatedPlayer();
    const playerId = player.id;
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId });
    if (limited) return limited;
    const body = await request.json() as { game?: unknown; code?: unknown; passphrase?: unknown };
    const target = await loadTarget(request, body);
    if ("response" in target) return target.response;
    if (isLanguageBoundGame(target.game)) assertRoomLanguageAccess(target.room, player.locale);
    const policy = await loadOnlineRoomSpectatorPolicy(target.game, target.code, target.room.createdAt);
    const isParticipant = target.room.players.some((player) => player.id === playerId);
    if (!isParticipant && !policy.enabled) return Response.json({ error: "Spectator access is not allowed" }, { status: 403 });
    const passphrase = typeof body.passphrase === "string" ? body.passphrase : "";
    if (!isParticipant && target.room.passphrase && passphrase !== target.room.passphrase) return Response.json({ error: "Bad passphrase" }, { status: 401 });
    const token = createOnlineRoomSpectatorGrant({ game: target.game, code: target.code, playerId, roomCreatedAt: target.room.createdAt });
    const cookieStore = await cookies();
    cookieStore.set(onlineRoomSpectatorCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: onlineRoomSpectatorGrantMaxAgeSeconds,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return commonOnlineRoomErrorResponse(error) ?? Response.json({ error: "Failed to start spectating" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const player = await requireAuthenticatedPlayer();
    const playerId = player.id;
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId });
    if (limited) return limited;
    const body = await request.json() as { game?: unknown; code?: unknown; enabled?: unknown };
    const target = await loadTarget(request, body);
    if ("response" in target) return target.response;
    if (isLanguageBoundGame(target.game)) assertRoomLanguageAccess(target.room, player.locale);
    if (target.room.hostId !== playerId) return Response.json({ error: "Only the host can change spectator access" }, { status: 403 });
    if (typeof body.enabled !== "boolean") return Response.json({ error: "enabled is required" }, { status: 400 });
    const policy = await saveOnlineRoomSpectatorPolicy(target.game, target.code, target.room.createdAt, body.enabled);
    await publishOnlineRoomRevision(target.game, target.room);
    return Response.json({ enabled: policy.enabled });
  } catch (error) {
    return commonOnlineRoomErrorResponse(error) ?? Response.json({ error: "Failed to update spectator access" }, { status: 500 });
  }
}
