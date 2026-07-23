import { playerHasDebugAccess } from "@/lib/debug-access";
import {
  createGameSdkOnlineRoomHttpHandlers,
} from "@/lib/game-sdk-online-room-http";
import { approvedGameSdkRegistration } from "@/lib/game-sdk-server-registry";
import { createRequestTelemetry } from "@/lib/observability";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ gameId: string }>;
};

type Method = "GET" | "POST" | "PATCH" | "DELETE";

function json(payload: unknown, status: number) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function handle(request: Request, context: RouteContext, method: Method) {
  const { gameId: rawGameId } = await context.params;
  const gameId = rawGameId.trim().toLowerCase();
  const registration = approvedGameSdkRegistration(gameId);
  if (!registration) return json({ error: "GAME_SDK_NOT_AVAILABLE" }, 404);

  const route = `/api/game-sdk/${gameId}/rooms`;
  const telemetry = createRequestTelemetry(request, route, {
    game: `sdk:${gameId}`,
    operation: method === "GET"
      ? "room-read"
      : method === "POST"
        ? "room-create"
        : method === "PATCH"
          ? "room-command"
          : "room-dissolve",
  });

  try {
    const session = await requireAuthenticatedPlayer();
    if (method !== "GET") {
      const limited = await rateLimitResponseFor(
        request,
        rateLimitPolicies.roomMutation,
        { playerId: session.id },
      );
      if (limited) return limited;
    }
    const identity = {
      playerId: session.id,
      displayName: session.name,
      debugAccess: registration.supportsDebug
        ? await playerHasDebugAccess(session.id)
        : false,
    };
    const actorRef = telemetry.actorRef(session.id);
    let observed = false;
    const handlers = createGameSdkOnlineRoomHttpHandlers({
      adapter: registration.createAdapter(async () => identity),
      onSuccess(operation, room, affected) {
        observed = true;
        if (method === "GET") return;
        telemetry.success("game-sdk.room", {
          action: operation,
          ...(room ? { roomRef: telemetry.roomRef(room.code) } : {}),
          actorRef,
          ...(room ? { phase: room.phase, revision: room.revision } : {}),
          ...(affected === undefined ? {} : { affected }),
        });
      },
      onError(operation, error, status) {
        observed = true;
        telemetry.responseError("game-sdk.room", error, status, {
          action: operation,
          actorRef,
        });
      },
    });
    const response = await handlers[method](request);
    if (!observed && response.status >= 400) {
      telemetry.reject("game-sdk.room", response.status, {
        action: method.toLowerCase() as Lowercase<Method>,
        actorRef,
      });
    }
    return response;
  } catch (error) {
    const response = commonOnlineRoomErrorResponse(error)
      ?? json({ error: "GAME_SDK_RUNTIME_FAILED" }, 500);
    telemetry.responseError("game-sdk.room", error, response.status);
    return response;
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
