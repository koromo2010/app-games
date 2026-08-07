import {
  type GameSdkCommandEnvelope,
  type GameSdkStoredRoom,
  type GameSdkTrustedActor,
  type GameSdkViewer,
} from "@game-fields/game-sdk";
import { gameSdkViewerFromActor } from "@game-fields/game-sdk/runtime";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import {
  getSdkPreviewAccountPlayerId,
  requireSdkPreviewAuthenticatedPlayer,
} from "@/lib/sdk-preview-account-session";
import { playerHasDebugAccess } from "@/lib/debug-access";
import { loadSdkPreviewPackageModule } from "@/lib/sdk-preview-package-runtime";
import {
  encodeSdkPreviewPackageSession,
  readSdkPreviewPackageSession,
  sdkPreviewPackageSessionPlayers,
  sdkPreviewPackageSessionMaxAgeSeconds,
  sdkPreviewPackageSessionSetCookie,
  type SdkPreviewPackageSession,
  type SdkPreviewPackageSessionScope,
} from "@/lib/sdk-preview-package-session";
import { GameSdkRuntimeError } from "@game-fields/game-sdk/mock-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ creatorSlug: string; gameId: string }>;
};

type PreviewCommand = { type: string };

type PreviewTarget = {
  creatorSlug: string;
  gameId: string;
  scope: SdkPreviewPackageSessionScope;
  actor: GameSdkTrustedActor;
  module: NonNullable<Awaited<ReturnType<typeof loadSdkPreviewPackageModule>>>;
};

function json(
  payload: unknown,
  status = 200,
  setCookie?: string,
) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
  });
  if (setCookie !== undefined) headers.set("Set-Cookie", setCookie);
  return Response.json(payload, { status, headers });
}

function errorCode(error: unknown) {
  if (error instanceof GameSdkRuntimeError) return error.code;
  if (!(error instanceof Error)) return "GAME_SDK_PREVIEW_RUNTIME_FAILED";
  return /^[A-Z][A-Z0-9_]{1,79}$/.test(error.message)
    ? error.message
    : "GAME_SDK_PREVIEW_RUNTIME_FAILED";
}

function errorStatus(code: string) {
  if (code === "PLAYER_SESSION_SECRET_NOT_CONFIGURED") return 503;
  if (code === "ROOM_NOT_FOUND") return 404;
  if (
    code === "STALE_REVISION"
    || code === "PLAYER_ACTIVE_ROOM"
    || code === "INVALID_PHASE"
    || code === "LOBBY_REQUIRED"
    || code === "NOT_ENOUGH_PLAYERS"
    || code === "ROOM_FULL"
    || code === "UNKNOWN_COMMAND"
  ) return 409;
  if (code === "DEBUG_ACCESS_REQUIRED" || code === "PLAYER_NOT_IN_ROOM") return 403;
  if (code === "SDK_PREVIEW_SESSION_TOO_LARGE") return 413;
  if (code.startsWith("GAME_SDK_INVALID_")) return 400;
  return 409;
}

function packageRevisionSnapshot<T>(
  snapshot: T,
  revision: string,
) {
  return {
    ...(snapshot as Record<string, unknown>),
    packageRevision: revision,
  };
}

function commandEnvelope(value: unknown): GameSdkCommandEnvelope<PreviewCommand> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const envelope = body.envelope;
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return null;
  const source = envelope as Record<string, unknown>;
  const command = source.command;
  if (
    !command
    || typeof command !== "object"
    || Array.isArray(command)
    || typeof (command as { type?: unknown }).type !== "string"
    || !Number.isSafeInteger(source.expectedRevision)
  ) return null;
  return {
    ...(typeof source.commandId === "string" ? { commandId: source.commandId } : {}),
    expectedRevision: Number(source.expectedRevision),
    command: command as PreviewCommand,
  };
}

function roomCode(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{4,12}$/.test(normalized) ? normalized : null;
}

function previewViewer(
  room: GameSdkStoredRoom,
  actor: GameSdkTrustedActor,
  value: unknown,
): GameSdkViewer {
  if (value === undefined || value === null || value === "self") {
    return gameSdkViewerFromActor(actor);
  }
  if (!actor.debugAccess) throw new Error("DEBUG_ACCESS_REQUIRED");
  if (value === "spectator") {
    return {
      playerId: null,
      role: "spectator",
      debugAccess: true,
    };
  }
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error("DEBUG_VIEWER_INVALID");
  }
  const player = sdkPreviewPackageSessionPlayers(room)[Number(value)];
  if (!player) throw new Error("DEBUG_VIEWER_INVALID");
  return {
    playerId: player.id,
    role: player.id === actor.playerId ? "host" : "player",
    debugAccess: true,
  };
}

function previewRuntime(target: PreviewTarget, initialRoom?: GameSdkStoredRoom) {
  const packageRuntime = target.module;
  if (!packageRuntime) throw new Error("SDK_PREVIEW_PACKAGE_NOT_AVAILABLE");
  return createGameSdkMockRuntime<
    GameSdkStoredRoom,
    unknown,
    PreviewCommand,
    unknown
  >({
    module: packageRuntime.module,
    ...(initialRoom ? { initialRooms: [initialRoom] } : {}),
    resources: packageRuntime.resources,
  });
}

async function target(
  request: Request,
  context: RouteContext,
): Promise<PreviewTarget | Response> {
  const { creatorSlug, gameId } = await context.params;
  const revision = new URL(request.url).searchParams.get("revision")?.trim() ?? "";
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    return json({ error: "SDK_PREVIEW_PACKAGE_NOT_AVAILABLE" }, 400);
  }
  let session;
  try {
    session = await requireSdkPreviewAuthenticatedPlayer(creatorSlug);
  } catch {
    return json({ error: "PLAYER_AUTH_REQUIRED" }, 401);
  }
  const [creatorPlayerId, packageRuntime] = await Promise.all([
    getSdkPreviewAccountPlayerId(creatorSlug),
    loadSdkPreviewPackageModule({
      creatorSlug,
      gameId,
      request,
      playerId: session.id,
      revision,
    }),
  ]);
  if (
    !packageRuntime
    || packageRuntime.definition.revision !== revision
  ) {
    return json({ error: "SDK_PREVIEW_PACKAGE_NOT_AVAILABLE" }, 404);
  }
  const debugAccess = creatorPlayerId === session.id
    || await playerHasDebugAccess(session.id);
  return {
    creatorSlug,
    gameId,
    scope: { creatorSlug, gameId, revision },
    actor: {
      playerId: session.id,
      displayName: session.name?.trim() || "SDK Player",
      role: "host",
      debugAccess,
    },
    module: packageRuntime,
  };
}

async function body(request: Request) {
  return await request.json().catch(() => null) as Record<string, unknown> | null;
}

async function handle(request: Request, context: RouteContext, method: "GET" | "POST" | "PATCH" | "DELETE") {
  try {
    const resolved = await target(request, context);
    if (resolved instanceof Response) return resolved;

    const state = readSdkPreviewPackageSession(
      request.headers.get("cookie"),
      resolved.scope,
      resolved.actor.playerId,
    );
    const query = new URL(request.url).searchParams;

    if (method === "GET") {
      if (!state) {
        if (query.get("active") === "1") return json({ room: null });
        return json(query.get("code") ? { error: "ROOM_NOT_FOUND" } : {
          rooms: [],
          nextCursor: null,
        }, query.get("code") ? 404 : 200);
      }
      if (query.get("active") === "1") {
        const runtime = previewRuntime(resolved, state.room);
        const room = await runtime.readRoom(
          state.room.code,
          gameSdkViewerFromActor(resolved.actor),
        );
        return json({
          room: room ? packageRevisionSnapshot(room, resolved.scope.revision) : null,
        });
      }
      const requestedCode = roomCode(query.get("code"));
      if (requestedCode && requestedCode !== state.room.code) {
        return json({ error: "ROOM_NOT_FOUND" }, 404);
      }
      if (!requestedCode) {
        return json({
          rooms: [],
          nextCursor: null,
        });
      }
      const runtime = previewRuntime(resolved, state.room);
      const room = await runtime.readRoom(
        state.room.code,
        previewViewer(state.room, resolved.actor, query.get("debugViewer") ?? undefined),
      );
      return room
        ? json({ room: packageRevisionSnapshot(room, resolved.scope.revision) })
        : json({ error: "ROOM_NOT_FOUND" }, 404);
    }

    if (method === "POST") {
      const input = await body(request);
      const code = roomCode(input?.roomCode);
      if (!code || !input?.create || typeof input.create !== "object") {
        return json({ error: "GAME_SDK_INVALID_ROOM_CREATE" }, 400);
      }
      const runtime = previewRuntime(resolved);
      const room = await runtime.createRoom({
        roomCode: code,
        create: input.create,
        actor: resolved.actor,
      });
      const stored = runtime.inspectStoredRoom(code);
      if (!stored) throw new Error("GAME_SDK_PREVIEW_SESSION_INVALID");
      const sessionValue: SdkPreviewPackageSession = {
        version: 1,
        scope: resolved.scope,
        playerId: resolved.actor.playerId,
        expiresAt: Date.now() + sdkPreviewPackageSessionMaxAgeSeconds * 1_000,
        room: stored as GameSdkStoredRoom & Record<string, unknown>,
      };
      const token = encodeSdkPreviewPackageSession(sessionValue);
      return json(
        { room: packageRevisionSnapshot(room, resolved.scope.revision) },
        200,
        sdkPreviewPackageSessionSetCookie(resolved.scope, token),
      );
    }

    if (method === "PATCH") {
      if (!state) return json({ error: "ROOM_NOT_FOUND" }, 404);
      const input = await body(request);
      const code = roomCode(input?.code);
      const envelope = commandEnvelope(input);
      if (!code || code !== state.room.code || !envelope) {
        return json({ error: "GAME_SDK_INVALID_COMMAND" }, 400);
      }
      const runtime = previewRuntime(resolved, state.room);
      const result = await runtime.sendCommand({
        code,
        envelope,
        actor: resolved.actor,
      });
      const stored = runtime.inspectStoredRoom(code);
      if (!stored) throw new Error("GAME_SDK_PREVIEW_SESSION_INVALID");
      const nextSession: SdkPreviewPackageSession = {
        version: 1,
        scope: resolved.scope,
        playerId: resolved.actor.playerId,
        expiresAt: Date.now() + sdkPreviewPackageSessionMaxAgeSeconds * 1_000,
        room: stored as GameSdkStoredRoom & Record<string, unknown>,
      };
      const token = encodeSdkPreviewPackageSession(nextSession);
      const selectedViewer = previewViewer(
        stored,
        resolved.actor,
        input?.finalViewer,
      );
      const presented = await runtime.readRoom(code, selectedViewer);
      if (!presented) throw new Error("ROOM_NOT_FOUND");
      return json({
        room: packageRevisionSnapshot(presented, resolved.scope.revision),
        revision: presented.revision,
        commandId: result.commandId,
        commandRevision: result.commandRevision,
        applied: result.applied,
      }, 200, sdkPreviewPackageSessionSetCookie(resolved.scope, token));
    }

    if (query.get("hosted") === "1") {
      return json({ dissolved: state ? 1 : 0 });
    }
    const requestedCode = roomCode(query.get("code"));
    if (!state || !requestedCode || requestedCode !== state.room.code) {
      return json({ dissolved: false }, 404);
    }
    return json(
      { dissolved: true },
      200,
      sdkPreviewPackageSessionSetCookie(resolved.scope, null),
    );
  } catch (error) {
    const code = errorCode(error);
    return json({ error: code }, errorStatus(code));
  }
}

export function GET(request: Request, context: RouteContext) {
  return handle(request, context, "GET");
}

export function POST(request: Request, context: RouteContext) {
  return handle(request, context, "POST");
}

export function PATCH(request: Request, context: RouteContext) {
  return handle(request, context, "PATCH");
}

export function DELETE(request: Request, context: RouteContext) {
  return handle(request, context, "DELETE");
}
