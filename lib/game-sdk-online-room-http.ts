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
  beforeMutation?: (
    request: Request,
    operation: Extract<
      GameSdkOnlineRoomHttpOperation,
      "create" | "command" | "dissolve" | "dissolve-hosted"
    >,
    roomCode: string,
  ) => Promise<Response | null>;
  onSuccess?: (
    operation: GameSdkOnlineRoomHttpOperation,
    room?: GameSdkRoomSnapshot<unknown>,
    affected?: number,
    command?: {
      commandId: string;
      commandRevision: number;
      applied: boolean;
    },
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
  "GAME_SDK_EFFECT_INDETERMINATE",
  "GAME_SDK_EFFECT_JOURNAL_MISSING",
  "GAME_SDK_LLM_BUDGET_UNAVAILABLE",
  "POSTGRES_STORE_NOT_CONFIGURED",
  "VOCABULARY_STORE_NOT_CONFIGURED",
]);

const maximumRoomRequestBytes = 128 * 1024;

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
  if (code === "GAME_SDK_HTTP_BODY_TOO_LARGE") {
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

async function readRoomRequestJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declaredLength)
    && declaredLength > maximumRoomRequestBytes
  ) {
    throw new Error("GAME_SDK_HTTP_BODY_TOO_LARGE");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximumRoomRequestBytes) {
    throw new Error("GAME_SDK_HTTP_BODY_TOO_LARGE");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
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
    || typeof envelope.commandId !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(envelope.commandId)
  ) {
    return null;
  }
  return {
    commandId: envelope.commandId,
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
  beforeMutation,
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
      const body = objectBody(await readRoomRequestJson(request));
      if (!body || !roomCode(body.roomCode).trim() || !("create" in body)) {
        return json({ error: "GAME_SDK_CREATE_INPUT_REQUIRED" }, 400);
      }
      if (
        typeof body.requestId !== "string"
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(body.requestId)
      ) {
        return json({ error: "GAME_SDK_CREATE_REQUEST_ID_REQUIRED" }, 400);
      }
      const limited = await beforeMutation?.(
        request,
        operation,
        roomCode(body.roomCode),
      );
      if (limited) return limited;
      const room = await adapter.createRoom({
        roomCode: roomCode(body.roomCode),
        create: body.create,
        requestId: body.requestId,
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
      const body = objectBody(await readRoomRequestJson(request));
      const code = roomCode(body?.code);
      const envelope = commandEnvelope(body?.envelope);
      if (!code.trim() || !envelope) {
        return json({ error: "GAME_SDK_COMMAND_INPUT_REQUIRED" }, 400);
      }
      const limited = await beforeMutation?.(request, operation, code);
      if (limited) return limited;
      const result: GameSdkCommandResult<unknown> = await adapter.sendCommand({
        code,
        envelope,
      });
      onSuccess?.(operation, result.room, undefined, {
        commandId: result.commandId,
        commandRevision: result.commandRevision,
        applied: result.applied,
      });
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
        const limited = await beforeMutation?.(
          request,
          operation,
          "hosted",
        );
        if (limited) return limited;
        const dissolved = await adapter.dissolveHostedRooms();
        onSuccess?.(operation, undefined, dissolved);
        return json({ dissolved });
      }
      const code = searchParams.get("code") ?? "";
      if (!code.trim()) return json({ error: "GAME_SDK_ROOM_CODE_REQUIRED" }, 400);
      const limited = await beforeMutation?.(request, operation, code);
      if (limited) return limited;
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
