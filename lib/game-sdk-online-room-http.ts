import type {
  GameSdkCommandEnvelope,
  GameSdkCommandResult,
  GameSdkRoomSnapshot,
} from "@game-fields/game-sdk";
import { GameFieldsPlatformRuntimeError } from "@game-fields/game-runtime";
import type { AuthenticatedGameSdkPlatformAdapter } from "./game-sdk-platform-adapter.ts";
import { GameSdkLlmRateLimitError } from "./game-sdk-llm-gateway.ts";

export type GameSdkOnlineRoomHttpOperation =
  | "read"
  | "active"
  | "list"
  | "create"
  | "command"
  | "dissolve"
  | "dissolve-hosted";

type SafeCommand = { type: string };

type HttpAdapter = AuthenticatedGameSdkPlatformAdapter<
  unknown,
  SafeCommand,
  unknown
>;

type HttpHandlerOptions = {
  adapter: HttpAdapter;
  onSuccess?: (
    operation: GameSdkOnlineRoomHttpOperation,
    room?: GameSdkRoomSnapshot<unknown>,
    affected?: number,
  ) => void;
  onError?: (
    operation: GameSdkOnlineRoomHttpOperation,
    error: unknown,
    status: number,
  ) => void;
};

const forbiddenCodes = new Set([
  "HOST_REQUIRED",
  "MEMBER_REQUIRED",
  "PLAYER_NOT_IN_ROOM",
  "HOST_MUST_DISSOLVE_ROOM",
]);

const conflictCodes = new Set([
  "CLUE_ALREADY_SUBMITTED",
  "GAME_IN_PROGRESS",
  "INVALID_PHASE",
  "LOBBY_REQUIRED",
  "NOT_ENOUGH_PLAYERS",
  "PLAYER_ACTIVE_ROOM",
  "PLAYER_ALREADY_JOINED",
  "RESULT_REQUIRED",
  "ROOM_FULL",
  "ROOM_NOT_JOINABLE",
  "SETTINGS_LOCKED",
  "STALE_REVISION",
  "VOTE_ALREADY_SUBMITTED",
]);

const badRequestCodes = new Set([
  "CLUE_REQUIRED",
  "GAME_SDK_INVALID_ROOM_CODE",
  "INVALID_VOTE_TARGET",
  "UNKNOWN_COMMAND",
]);

const unavailableCodes = new Set([
  "GAME_SDK_CONTENT_ID_SECRET_UNAVAILABLE",
  "GAME_SDK_CONTENT_SOURCE_UNAVAILABLE",
  "GAME_SDK_CONTENT_UNAVAILABLE",
  "POSTGRES_STORE_NOT_CONFIGURED",
  "VOCABULARY_STORE_NOT_CONFIGURED",
]);

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safeModuleErrorCode(error: unknown) {
  if (!(error instanceof Error)) return null;
  return /^[A-Z][A-Z0-9_]{1,79}$/.test(error.message)
    ? error.message
    : null;
}

export function gameSdkOnlineRoomErrorResponse(error: unknown) {
  if (error instanceof GameFieldsPlatformRuntimeError) {
    return json({ error: error.code }, error.status);
  }
  if (error instanceof GameSdkLlmRateLimitError) {
    return Response.json(
      {
        error: error.message,
        retryAfterMs: error.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(
            Math.max(1, Math.ceil(error.retryAfterMs / 1000)),
          ),
        },
      },
    );
  }
  const code = safeModuleErrorCode(error);
  if (!code) return json({ error: "GAME_SDK_RUNTIME_FAILED" }, 500);
  if (code === "GAME_SDK_PLATFORM_ROOM_TOO_LARGE") {
    return json({ error: code }, 413);
  }
  if (unavailableCodes.has(code)) return json({ error: code }, 503);
  if (forbiddenCodes.has(code)) return json({ error: code }, 403);
  if (conflictCodes.has(code)) return json({ error: code }, 409);
  if (badRequestCodes.has(code) || code.startsWith("GAME_SDK_INVALID_")) {
    return json({ error: code }, 400);
  }
  return json({ error: "GAME_SDK_COMMAND_REJECTED" }, 409);
}

function objectBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function roomCode(value: unknown) {
  return typeof value === "string" ? value : "";
}

function commandEnvelope(value: unknown): GameSdkCommandEnvelope<SafeCommand> | null {
  const envelope = objectBody(value);
  const command = objectBody(envelope?.command);
  if (
    !envelope
    || !command
    || typeof command.type !== "string"
    || !command.type.trim()
    || !Number.isSafeInteger(envelope.expectedRevision)
    || Number(envelope.expectedRevision) < 1
  ) {
    return null;
  }
  return {
    expectedRevision: Number(envelope.expectedRevision),
    command: command as SafeCommand,
  };
}

/**
 * Transport-only Room handlers for one approved SDK module.
 *
 * Authentication, rate limiting and module lookup stay in the Next.js route.
 * The adapter resolves the actor from the signed platform session.
 */
export function createGameSdkOnlineRoomHttpHandlers({
  adapter,
  onSuccess,
  onError,
}: HttpHandlerOptions) {
  async function GET(request: Request) {
    let operation: GameSdkOnlineRoomHttpOperation = "list";
    try {
      const searchParams = new URL(request.url).searchParams;
      if (searchParams.get("active") === "1") {
        operation = "active";
        const room = await adapter.readActiveRoom();
        onSuccess?.(operation, room ?? undefined);
        return json({ room });
      }
      const code = searchParams.get("code") ?? "";
      if (!code.trim()) {
        const page = await adapter.listRooms(searchParams.get("cursor"));
        onSuccess?.(operation, undefined, page.rooms.length);
        return json(page);
      }
      operation = "read";
      const room = await adapter.readRoom(code);
      if (!room) return json({ error: "ROOM_NOT_FOUND" }, 404);
      onSuccess?.(operation, room);
      return json({ room });
    } catch (error) {
      const response = gameSdkOnlineRoomErrorResponse(error);
      onError?.(operation, error, response.status);
      return response;
    }
  }

  async function POST(request: Request) {
    const operation = "create" as const;
    try {
      const body = objectBody(await request.json().catch(() => null));
      if (!body || !roomCode(body.roomCode).trim() || !("create" in body)) {
        return json({ error: "GAME_SDK_CREATE_INPUT_REQUIRED" }, 400);
      }
      const room = await adapter.createRoom({
        roomCode: roomCode(body.roomCode),
        create: body.create,
      });
      onSuccess?.(operation, room);
      return json({ room });
    } catch (error) {
      const response = gameSdkOnlineRoomErrorResponse(error);
      onError?.(operation, error, response.status);
      return response;
    }
  }

  async function PATCH(request: Request) {
    const operation = "command" as const;
    try {
      const body = objectBody(await request.json().catch(() => null));
      const code = roomCode(body?.code);
      const envelope = commandEnvelope(body?.envelope);
      if (!code.trim() || !envelope) {
        return json({ error: "GAME_SDK_COMMAND_INPUT_REQUIRED" }, 400);
      }
      const result: GameSdkCommandResult<unknown> = await adapter.sendCommand({
        code,
        envelope,
      });
      onSuccess?.(operation, result.room);
      return json(result);
    } catch (error) {
      const response = gameSdkOnlineRoomErrorResponse(error);
      onError?.(operation, error, response.status);
      return response;
    }
  }

  async function DELETE(request: Request) {
    let operation: GameSdkOnlineRoomHttpOperation = "dissolve";
    try {
      const searchParams = new URL(request.url).searchParams;
      if (searchParams.get("hosted") === "1") {
        operation = "dissolve-hosted";
        const dissolved = await adapter.dissolveHostedRooms();
        onSuccess?.(operation, undefined, dissolved);
        return json({ dissolved });
      }
      const code = searchParams.get("code") ?? "";
      if (!code.trim()) return json({ error: "GAME_SDK_ROOM_CODE_REQUIRED" }, 400);
      const dissolved = await adapter.dissolveRoom(code);
      onSuccess?.(operation, undefined, dissolved ? 1 : 0);
      return json({ dissolved });
    } catch (error) {
      const response = gameSdkOnlineRoomErrorResponse(error);
      onError?.(operation, error, response.status);
      return response;
    }
  }

  return { GET, POST, PATCH, DELETE };
}
