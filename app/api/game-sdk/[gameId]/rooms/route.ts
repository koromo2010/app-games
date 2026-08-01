import { playerHasDebugAccess } from "@/lib/debug-access";
import {
  createGameSdkOnlineRoomHttpHandlers,
} from "@/lib/game-sdk-online-room-http";
import { approvedGameSdkRegistration } from "@/lib/game-sdk-server-registry";
import { loadApprovedGameSdkRuntimeRegistration } from "@/lib/game-sdk-runtime-catalog";
import { createRequestTelemetry } from "@/lib/observability";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { createGameSdkCommandTimingCollector } from "@/lib/game-sdk-command-timing";

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
  const timing = createGameSdkCommandTimingCollector();
  const { gameId: rawGameId } = await context.params;
  const gameId = rawGameId.trim().toLowerCase();
  const requestedRevision = new URL(request.url).searchParams
    .get("revision")
    ?.trim() || undefined;
  if (requestedRevision && !/^[a-f0-9]{40}$/.test(requestedRevision)) {
    return json({ error: "GAME_SDK_INVALID_PACKAGE_REVISION" }, 400);
  }
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
  let registration;
  try {
    registration = await timing.measure("runtime-resolve", async () => (
      approvedGameSdkRegistration(gameId)
        ?? await loadApprovedGameSdkRuntimeRegistration(
          gameId,
          process.env,
          requestedRevision,
        )
    ));
  } catch (error) {
    telemetry.failure("game-sdk.catalog", error, 503, {
      action: "runtime-resolve",
    });
    return json({ error: "GAME_SDK_RUNTIME_CATALOG_UNAVAILABLE" }, 503);
  }
  if (!registration) {
    telemetry.reject("game-sdk.catalog", 404, {
      action: "runtime-resolve",
      errorCode: "GAME_SDK_NOT_AVAILABLE",
    });
    return json({ error: "GAME_SDK_NOT_AVAILABLE" }, 404);
  }

  try {
    const { session, identity } = await timing.measure("auth", async () => {
      const authenticated = await requireAuthenticatedPlayer();
      return {
        session: authenticated,
        identity: {
          playerId: authenticated.id,
          displayName: authenticated.name,
          debugAccess: registration.supportsDebug
            ? await playerHasDebugAccess(authenticated.id)
            : false,
        },
      };
    });
    if (method === "GET") {
      const limited = await rateLimitResponseFor(
        request,
        identity.debugAccess
          ? rateLimitPolicies.sdkRuntimeReadDebug
          : rateLimitPolicies.sdkRuntimeRead,
        { playerId: session.id },
      );
      if (limited) return limited;
    }
    const actorRef = telemetry.actorRef(session.id);
    let observed = false;
    const handlers = createGameSdkOnlineRoomHttpHandlers({
      timing: method === "PATCH" ? timing : undefined,
      adapter: registration.createAdapter(
        async () => identity,
        request,
        session.id,
      ),
      beforeMutation: (mutationRequest, _operation, roomCode) => (
        rateLimitResponseFor(
          mutationRequest,
          identity.debugAccess
            ? rateLimitPolicies.sdkRoomMutationDebug
            : rateLimitPolicies.sdkRoomMutation,
          {
            playerId: session.id,
            packageId: gameId,
            roomId: `${gameId}/${roomCode}`,
          },
        )
      ),
      onSuccess(operation, room, affected, command) {
        observed = true;
        if (method === "GET") return;
        telemetry.success("game-sdk.room", {
          action: operation,
          channel: registration.deployment,
          ...(registration.revision ? {
            packageRevision: registration.revision,
          } : {}),
          ...(registration.packageRootSha256 ? {
            packageRoot: registration.packageRootSha256,
          } : {}),
          ...(room ? { roomRef: telemetry.roomRef(room.code) } : {}),
          actorRef,
          ...(room ? { phase: room.phase, revision: room.revision } : {}),
          ...(affected === undefined ? {} : { affectedCount: affected }),
          ...(command ? {
            commandRef: telemetry.commandRef(command.commandId),
            commandRevision: command.commandRevision,
            applied: command.applied,
          } : {}),
        });
      },
      onError(operation, error, status) {
        observed = true;
        telemetry.responseError("game-sdk.room", error, status, {
          action: operation,
          channel: registration.deployment,
          ...(registration.revision ? {
            packageRevision: registration.revision,
          } : {}),
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
    if (method !== "PATCH") return response;
    for (const entry of timing.finish()) {
      telemetry.info("game-sdk.command-timing", timing.observabilityFields(entry));
    }
    return timing.decorate(response);
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
