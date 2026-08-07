import {
  type GameSdkCommandEnvelope,
  type GameSdkRoomSnapshot,
  type GameSdkStoredRoom,
  type GameSdkTrustedActor,
  type GameSdkViewer,
} from "@game-fields/game-sdk";
import { GameSdkRuntimeError } from "@game-fields/game-sdk/mock-runtime";
import { gameSdkViewerFromActor } from "@game-fields/game-sdk/runtime";
import {
  platformDebugProxyCommand,
  withPlatformDebugView,
} from "./game-sdk-platform-adapter.ts";
import {
  readSdkPreviewPackageSession,
  sdkPreviewPackageSessionPlayers,
  sdkPreviewPackageSessionMaxAgeSeconds,
  sdkPreviewPackageSessionSetCookie,
  encodeSdkPreviewPackageSession,
  type SdkPreviewPackageSession,
  type SdkPreviewPackageSessionScope,
} from "./sdk-preview-package-session.ts";

type RouteContext = {
  params: Promise<{ creatorSlug: string; gameId: string }>;
};

type PreviewCommand = { type: string };

export type SdkPreviewPackageRouteTarget = {
  creatorSlug: string;
  gameId: string;
  scope: SdkPreviewPackageSessionScope;
  actor: GameSdkTrustedActor;
  debugEnabled: boolean;
  module: unknown;
};

type PreviewRuntime = {
  readRoom(
    code: string,
    viewer: GameSdkViewer,
  ): Promise<GameSdkRoomSnapshot<unknown> | null>;
  createRoom(input: {
    roomCode: string;
    create: Record<string, unknown>;
    actor: GameSdkTrustedActor;
  }): Promise<GameSdkRoomSnapshot<unknown>>;
  inspectStoredRoom(code: string): GameSdkStoredRoom | null;
  sendCommand(input: {
    code: string;
    envelope: GameSdkCommandEnvelope<PreviewCommand>;
    actor: GameSdkTrustedActor;
  }): Promise<{
    commandId: string;
    commandRevision: number;
    applied: boolean;
  }>;
};

type PreviewRuntimeFactory = (
  target: SdkPreviewPackageRouteTarget,
  initialRoom?: GameSdkStoredRoom,
) => PreviewRuntime;

type TargetResolver = (
  request: Request,
  context: RouteContext,
) => Promise<SdkPreviewPackageRouteTarget | Response>;

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
  if (code === "DEBUG_VIEWER_INVALID") return 400;
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

function previewRoomSnapshot(
  target: SdkPreviewPackageRouteTarget,
  snapshot: GameSdkRoomSnapshot<unknown> | null,
  storedRoom: GameSdkStoredRoom | null,
) {
  return withPlatformDebugView(snapshot, {
    allowed: Boolean(
      target.debugEnabled
      && target.actor.debugAccess
      && target.actor.role === "host"
      && storedRoom
      && "hostPlayerId" in storedRoom
      && storedRoom.hostPlayerId === target.actor.playerId
    ),
    storedRoom,
    packageRevision: target.scope.revision,
  });
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

function previewViewerValue(value: unknown): "self" | "spectator" | number {
  if (value === undefined || value === null || value === "self") {
    return "self";
  }
  if (value === "spectator") return "spectator";
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value >= 0) return value;
    throw new Error("DEBUG_VIEWER_INVALID");
  }
  if (
    typeof value !== "string"
    || !/^(0|[1-9][0-9]*)$/.test(value)
  ) {
    throw new Error("DEBUG_VIEWER_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("DEBUG_VIEWER_INVALID");
  }
  return parsed;
}

function previewViewer(
  room: GameSdkStoredRoom,
  actor: GameSdkTrustedActor,
  value: unknown,
): GameSdkViewer {
  const normalized = previewViewerValue(value);
  if (normalized === "self") {
    return gameSdkViewerFromActor(actor);
  }
  if (!actor.debugAccess) throw new Error("DEBUG_ACCESS_REQUIRED");
  if (normalized === "spectator") {
    return {
      playerId: null,
      role: "spectator",
      debugAccess: true,
    };
  }
  const player = sdkPreviewPackageSessionPlayers(room)[normalized];
  if (!player) throw new Error("DEBUG_VIEWER_INVALID");
  return {
    playerId: player.id,
    role: player.id === actor.playerId ? "host" : "player",
    debugAccess: true,
  };
}

async function body(request: Request) {
  return await request.json().catch(() => null) as Record<string, unknown> | null;
}

export function createSdkPreviewPackageRouteHandler(input: {
  resolveTarget: TargetResolver;
  createRuntime: PreviewRuntimeFactory;
}) {
  return async function handle(
    request: Request,
    context: RouteContext,
    method: "GET" | "POST" | "PATCH" | "DELETE",
  ) {
    try {
      const resolved = await input.resolveTarget(request, context);
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
          const runtime = input.createRuntime(resolved, state.room);
          const room = previewRoomSnapshot(resolved, await runtime.readRoom(
            state.room.code,
            gameSdkViewerFromActor(resolved.actor),
          ), state.room);
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
        const runtime = input.createRuntime(resolved, state.room);
        const room = previewRoomSnapshot(resolved, await runtime.readRoom(
          state.room.code,
          previewViewer(state.room, resolved.actor, query.get("debugViewer") ?? undefined),
        ), state.room);
        return room
          ? json({ room: packageRevisionSnapshot(room, resolved.scope.revision) })
          : json({ error: "ROOM_NOT_FOUND" }, 404);
      }

      if (method === "POST") {
        const inputBody = await body(request);
        const code = roomCode(inputBody?.roomCode);
        if (!code || !inputBody?.create || typeof inputBody.create !== "object") {
          return json({ error: "GAME_SDK_INVALID_ROOM_CREATE" }, 400);
        }
        const runtime = input.createRuntime(resolved);
        const room = await runtime.createRoom({
          roomCode: code,
          create: inputBody.create as Record<string, unknown>,
          actor: resolved.actor,
        });
        const stored = runtime.inspectStoredRoom(code);
        if (!stored) throw new Error("GAME_SDK_PREVIEW_SESSION_INVALID");
        const presented = previewRoomSnapshot(resolved, room, stored);
        const sessionValue: SdkPreviewPackageSession = {
          version: 1,
          scope: resolved.scope,
          playerId: resolved.actor.playerId,
          expiresAt: Date.now() + sdkPreviewPackageSessionMaxAgeSeconds * 1_000,
          room: stored as GameSdkStoredRoom & Record<string, unknown>,
        };
        const token = encodeSdkPreviewPackageSession(sessionValue);
        return json(
          { room: packageRevisionSnapshot(presented, resolved.scope.revision) },
          200,
          sdkPreviewPackageSessionSetCookie(resolved.scope, token),
        );
      }

      if (method === "PATCH") {
        const state = readSdkPreviewPackageSession(
          request.headers.get("cookie"),
          resolved.scope,
          resolved.actor.playerId,
        );
        if (!state) return json({ error: "ROOM_NOT_FOUND" }, 404);
        const inputBody = await body(request);
        const code = roomCode(inputBody?.code);
        const envelope = commandEnvelope(inputBody);
        if (!code || code !== state.room.code || !envelope) {
          return json({ error: "GAME_SDK_INVALID_COMMAND" }, 400);
        }
        const runtime = input.createRuntime(resolved, state.room);
        const debugProxy = platformDebugProxyCommand(envelope.command);
        let commandActor = resolved.actor;
        let commandEnvelopeValue = envelope;
        if (debugProxy) {
          if (
            !resolved.debugEnabled
            || !resolved.actor.debugAccess
            || resolved.actor.role !== "host"
            || !state.room
            || !("hostPlayerId" in state.room)
            || state.room.hostPlayerId !== resolved.actor.playerId
          ) {
            throw new Error("DEBUG_ACCESS_REQUIRED");
          }
          if (state.room.phase !== "playing") {
            throw new Error("DEBUG_PROGRESS_PHASE_REQUIRED");
          }
          const target = sdkPreviewPackageSessionPlayers(state.room)[debugProxy.seat];
          if (
            target?.isDummy !== true
            || typeof target.id !== "string"
            || typeof target.displayName !== "string"
          ) {
            throw new Error("DEBUG_DUMMY_REQUIRED");
          }
          commandActor = {
            playerId: target.id,
            displayName: target.displayName,
            role: "player",
            debugAccess: false,
          };
          commandEnvelopeValue = {
            ...envelope,
            command: debugProxy.command,
          };
        }
        const result = await runtime.sendCommand({
          code,
          envelope: commandEnvelopeValue,
          actor: commandActor,
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
          inputBody?.finalViewer,
        );
        const presented = previewRoomSnapshot(
          resolved,
          await runtime.readRoom(code, selectedViewer),
          stored,
        );
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
  };
}
