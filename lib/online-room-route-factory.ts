import { conditionalJsonResponse, conditionalVersionedJsonResponse } from "@/lib/conditional-json";
import { actionRequiresDebugAccess, requirePlayerDebugAccess, roomRequestsDebugMode } from "@/lib/debug-access";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import {
  assertGameLocaleAvailable,
  assertRoomLanguageAccess,
  filterRoomPageByLocale,
  isLanguageBoundGame,
} from "@/lib/game-language";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { authenticatedRoomDraft, authenticatedRoomPlayer } from "@/lib/online-room-input";
import { requireAuthenticatedPlayer, requireAuthenticatedPlayerId } from "@/lib/player-auth";
import { loadStoredPlayerSession } from "@/lib/player-store";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

export type OnlineRoomRouteOperation = "read" | "create" | "command" | "delete";

export type OnlineRoomRouteSession = Awaited<ReturnType<typeof requireAuthenticatedPlayer>>;

export type OnlineRoomRouteRoom = {
  code: string;
  revision: number;
  contentLocale?: unknown;
  players: Array<{ id: string }>;
};

export type OnlineRoomRouteListPage<Choice = unknown> = {
  rooms: Choice[];
  nextCursor?: string | null;
};

type RequestTelemetry = ReturnType<typeof createRequestTelemetry>;

type MutationContext = {
  request: Request;
  session: OnlineRoomRouteSession;
  telemetry: RequestTelemetry;
};

type CreateContext = MutationContext & {
  body: { room?: unknown } & Record<string, unknown>;
  roomDraft: unknown;
};

export type OnlineRoomCommandContext<Room extends OnlineRoomRouteRoom> = MutationContext & {
  body: { code?: unknown; action?: unknown } & Record<string, unknown>;
  code: string;
  action: Record<string, unknown>;
  targetRoom: Room | null;
};

type DeleteContext = MutationContext & {
  code: string;
  actorId: string;
  ownerId: string;
};

export type OnlineRoomRouteConfig<Room extends OnlineRoomRouteRoom, Choice = unknown> = {
  gameId: string;
  route: string;
  errorResponse: (error: unknown, operation: OnlineRoomRouteOperation) => Response;
  read: {
    loadRoom: (code: string) => Promise<Room | null>;
    loadActiveRoom: (playerId: string) => Promise<Room | null>;
    listRooms: (cursor: string | null) => Promise<OnlineRoomRouteListPage<Choice>>;
    presentRoom: (room: Room, viewerId: string) => unknown;
    afterLoad?: (room: Room, viewerId: string) => Promise<Room>;
    versioned?: boolean;
  };
  create: (context: CreateContext) => Promise<Room>;
  command: (context: OnlineRoomCommandContext<Room>) => Promise<Room | Response>;
  delete: {
    room: (context: DeleteContext) => Promise<void>;
    hosted: (context: DeleteContext) => Promise<number>;
    forbiddenMessage?: string;
  };
  telemetryFields: (room: Room) => ObservabilityFields;
};

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function actionName(action: Record<string, unknown>) {
  return typeof action.type === "string" ? action.type : "unknown";
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export function createOnlineRoomRouteHandlers<Room extends OnlineRoomRouteRoom, Choice = unknown>(
  config: OnlineRoomRouteConfig<Room, Choice>,
) {
  async function GET(request: Request) {
    const telemetry = createRequestTelemetry(request, config.route, { game: config.gameId, operation: "room-read" });
    const accessDenied = await gameApiAccessDeniedResponse(config.gameId);
    if (accessDenied) return accessDenied;
    const url = new URL(request.url);
    const code = normalizeCode(url.searchParams.get("code"));
    const requestedPlayerId = url.searchParams.get("playerId")?.trim() ?? "";

    try {
      const authenticatedPlayerId = await requireAuthenticatedPlayerId();
      if (requestedPlayerId && requestedPlayerId !== authenticatedPlayerId) {
        return Response.json({ error: "Room access is not allowed" }, { status: 403 });
      }

      if (code) {
        let room = await config.read.loadRoom(code);
        if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
        if (!room.players.some((player) => player.id === authenticatedPlayerId)) {
          return Response.json({ error: "Room access is not allowed" }, { status: 403 });
        }
        if (config.read.afterLoad) room = await config.read.afterLoad(room, authenticatedPlayerId);
        return config.read.versioned === false
          ? conditionalJsonResponse(request, { room: config.read.presentRoom(room, authenticatedPlayerId) })
          : conditionalVersionedJsonResponse(
              request,
              `${config.gameId}:${room.code}:${room.revision}:${authenticatedPlayerId}`,
              () => ({ room: config.read.presentRoom(room, authenticatedPlayerId) }),
            );
      }

      if (requestedPlayerId) {
        let room = await config.read.loadActiveRoom(authenticatedPlayerId);
        if (room && config.read.afterLoad) room = await config.read.afterLoad(room, authenticatedPlayerId);
        if (!room) return conditionalJsonResponse(request, { room: null });
        return config.read.versioned === false
          ? conditionalJsonResponse(request, { room: config.read.presentRoom(room, authenticatedPlayerId) })
          : conditionalVersionedJsonResponse(
              request,
              `${config.gameId}:${room.code}:${room.revision}:${authenticatedPlayerId}`,
              () => ({ room: config.read.presentRoom(room, authenticatedPlayerId) }),
            );
      }

      const page = await config.read.listRooms(url.searchParams.get("cursor"));
      if (!isLanguageBoundGame(config.gameId)) return conditionalJsonResponse(request, page);
      const session = await loadStoredPlayerSession(authenticatedPlayerId);
      return conditionalJsonResponse(
        request,
        filterRoomPageByLocale(
          page as OnlineRoomRouteListPage<Choice & { contentLocale?: unknown }>,
          session?.locale,
        ),
      );
    } catch (error) {
      const response = config.errorResponse(error, "read");
      if (response.status >= 500) {
        telemetry.responseError("room.read", error, response.status, { roomRef: telemetry.roomRef(code) });
      }
      return response;
    }
  }

  async function POST(request: Request) {
    const telemetry = createRequestTelemetry(request, config.route, { game: config.gameId, operation: "room-create" });
    let fields: ObservabilityFields = { action: "create-room" };
    const accessDenied = await gameApiAccessDeniedResponse(config.gameId);
    if (accessDenied) return accessDenied;

    try {
      const session = await requireAuthenticatedPlayer();
      if (isLanguageBoundGame(config.gameId)) assertGameLocaleAvailable(config.gameId, session.locale);
      const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
      if (limited) return limited;
      const body = await request.json() as CreateContext["body"];
      const requestedRoom = body.room && typeof body.room === "object"
        ? body.room as Record<string, unknown>
        : null;
      if (roomRequestsDebugMode(requestedRoom)) await requirePlayerDebugAccess(session.id);
      fields = {
        ...fields,
        roomRef: telemetry.roomRef(requestedRoom?.code),
        actorRef: telemetry.actorRef(session.id),
      };
      const room = await config.create({
        request,
        session,
        telemetry,
        body,
        roomDraft: authenticatedRoomDraft(body.room, session),
      });
      telemetry.success("room.mutation", { ...fields, ...config.telemetryFields(room) });
      return Response.json({ room: config.read.presentRoom(room, session.id) });
    } catch (error) {
      const response = config.errorResponse(error, "create");
      telemetry.responseError("room.mutation", error, response.status, fields);
      return response;
    }
  }

  async function PATCH(request: Request) {
    const telemetry = createRequestTelemetry(request, config.route, { game: config.gameId, operation: "room-command" });
    let fields: ObservabilityFields = {};
    const accessDenied = await gameApiAccessDeniedResponse(config.gameId);
    if (accessDenied) return accessDenied;

    try {
      const session = await requireAuthenticatedPlayer();
      const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
      if (limited) return limited;
      const body = await request.json() as OnlineRoomCommandContext<Room>["body"];
      const code = normalizeCode(body.code);
      if (!code || !body.action || typeof body.action !== "object") {
        telemetry.reject("room.command", 400);
        return Response.json({ error: "code and action are required" }, { status: 400 });
      }
      let action: Record<string, unknown> = {
        ...(body.action as Record<string, unknown>),
        actorId: session.id,
      };
      if (actionRequiresDebugAccess(action, session.id)) await requirePlayerDebugAccess(session.id);
      fields = {
        action: actionName(action),
        roomRef: telemetry.roomRef(code),
        actorRef: telemetry.actorRef(session.id),
      };
      let targetRoom: Room | null = null;
      if (action.type === "join-room" && isLanguageBoundGame(config.gameId)) {
        targetRoom = await config.read.loadRoom(code);
        if (!targetRoom) return Response.json({ error: "Room not found" }, { status: 404 });
        assertRoomLanguageAccess(targetRoom, session.locale);
      }
      if (action.type === "join-room") {
        action = { ...action, player: authenticatedRoomPlayer(session) };
      }
      const result = await config.command({ request, session, telemetry, body, code, action, targetRoom });
      if (isResponse(result)) return result;
      telemetry.success("room.command", { ...fields, ...config.telemetryFields(result) });
      return Response.json({ room: config.read.presentRoom(result, session.id) });
    } catch (error) {
      const response = config.errorResponse(error, "command");
      telemetry.responseError("room.command", error, response.status, fields);
      return response;
    }
  }

  async function DELETE(request: Request) {
    const telemetry = createRequestTelemetry(request, config.route, { game: config.gameId, operation: "room-delete" });
    const accessDenied = await gameApiAccessDeniedResponse(config.gameId);
    if (accessDenied) return accessDenied;
    const url = new URL(request.url);
    const code = normalizeCode(url.searchParams.get("code"));
    const actorId = url.searchParams.get("actorId")?.trim() ?? "";
    const ownerId = url.searchParams.get("ownerId")?.trim() ?? "";

    try {
      const session = await requireAuthenticatedPlayer();
      const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
      if (limited) return limited;
      const fields: ObservabilityFields = {
        action: code ? "delete-room" : "delete-hosted-rooms",
        roomRef: telemetry.roomRef(code),
        actorRef: telemetry.actorRef(session.id),
      };
      const context = { request, session, telemetry, code, actorId, ownerId };
      if (code) {
        if (actorId && actorId !== session.id) {
          telemetry.reject("room.delete", 403, fields);
          return Response.json(
            { error: config.delete.forbiddenMessage ?? "Room action is not allowed" },
            { status: 403 },
          );
        }
        await config.delete.room(context);
        telemetry.success("room.delete", fields);
        return Response.json({ ok: true });
      }
      if (ownerId) {
        const deleted = await config.delete.hosted(context);
        telemetry.success("room.delete", { ...fields, affectedCount: deleted });
        return Response.json({ ok: true, deleted });
      }
      telemetry.reject("room.delete", 400, fields);
      return Response.json({ error: "code or ownerId is required" }, { status: 400 });
    } catch (error) {
      const response = config.errorResponse(error, "delete");
      telemetry.responseError("room.delete", error, response.status, { roomRef: telemetry.roomRef(code) });
      return response;
    }
  }

  return { GET, POST, PATCH, DELETE };
}
