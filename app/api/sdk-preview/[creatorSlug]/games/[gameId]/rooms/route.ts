import { playerHasDebugAccess } from "@/lib/debug-access";
import { createGameSdkOnlineRoomHttpHandlers } from "@/lib/game-sdk-online-room-http";
import { createAuthenticatedGameSdkPlatformAdapter } from "@/lib/game-sdk-platform-adapter";
import {
  gameSdkModuleIsRequired,
  normalizeGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import {
  getSdkPreviewAccountPlayerId,
  requireSdkPreviewAuthenticatedPlayer,
} from "@/lib/sdk-preview-account-session";
import { loadSdkPreviewPackageModule } from "@/lib/sdk-preview-package-runtime";
import { createRequestTelemetry } from "@/lib/observability";
import { createGameSdkCommandTimingCollector } from "@/lib/game-sdk-command-timing";
import platformRelease from "../../../../../../../config/platform-release.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ creatorSlug: string; gameId: string }>;
};

type Method = "GET" | "POST" | "PATCH" | "DELETE";

function json(payload: unknown, status: number) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function handle(request: Request, context: RouteContext, method: Method) {
  const timing = createGameSdkCommandTimingCollector();
  const { creatorSlug, gameId } = await context.params;
  const requestUrl = new URL(request.url);
  const requestedRevision = requestUrl.searchParams.get("revision")?.trim() || undefined;
  const route = `/api/sdk-preview/${creatorSlug}/games/${gameId}/rooms`;
  const telemetry = createRequestTelemetry(request, route, {
    game: `sdk-preview:${gameId}`,
    operation: method === "GET"
      ? "room-read"
      : method === "POST"
        ? "room-create"
        : method === "PATCH"
          ? "room-command"
          : "room-dissolve",
  });
  timing.setRequestId(telemetry.requestId);
  try {
    const { session, creatorPlayerId } = await timing.measure("auth", async () => {
      const [authenticated, ownerPlayerId] = await Promise.all([
        requireSdkPreviewAuthenticatedPlayer(creatorSlug),
        getSdkPreviewAccountPlayerId(creatorSlug),
      ]);
      return { session: authenticated, creatorPlayerId: ownerPlayerId };
    });
    if (method === "GET") {
      const limited = await rateLimitResponseFor(
        request,
        rateLimitPolicies.sdkRuntimeRead,
        { playerId: session.id, environment: "candidate-preview" },
      );
      if (limited) return limited;
    }
    const runtime = await timing.measure(
      "runtime-resolve",
      () => loadSdkPreviewPackageModule({
        creatorSlug,
        gameId,
        request,
        playerId: session.id,
        revision: requestedRevision,
      }),
    );
    if (!runtime) {
      telemetry.reject("game-sdk.preview-room", 404, {
        channel: "candidate-preview",
        errorCode: "SDK_PREVIEW_PACKAGE_NOT_AVAILABLE",
      });
      return json({ error: "SDK_PREVIEW_PACKAGE_NOT_AVAILABLE" }, 404);
    }
    const moduleProfile = normalizeGameSdkModuleProfile(
      runtime.definition.modulePolicy,
    );
    const isSiteAdminIdentity = creatorPlayerId === session.id
      ? false
      : await timing.measure("auth", () => playerHasDebugAccess(session.id));
    const identity = {
      playerId: session.id,
      displayName: session.name?.trim() || "SDK Player",
      debugAccess: creatorPlayerId === session.id
        || isSiteAdminIdentity
        ? gameSdkModuleIsRequired(moduleProfile, "debug")
        : false,
    };
    const adapter = createAuthenticatedGameSdkPlatformAdapter({
      module: runtime.module,
      moduleProfile,
      environment: "candidate-preview",
      roomScopeId: runtime.roomScopeId,
      runtimeContract: runtime.runtimeContract,
      allowActiveRoomPackageRevisionReplacement: true,
      async resolveRuntime(contract) {
        const pinned = await loadSdkPreviewPackageModule({
          creatorSlug,
          gameId,
          request,
          playerId: session.id,
          revision: contract.packageRevision,
        });
        if (!pinned) return null;
        if (
          pinned.definition.revision !== contract.packageRevision
          || pinned.definition.packageRootSha256 !== contract.packageRootSha256
          || !platformRelease.supportedSdkContractVersions.includes(
            contract.sdkContractVersion,
          )
        ) return null;
        return {
          module: pinned.module,
          runtimeContract: contract,
          moduleProfile: normalizeGameSdkModuleProfile(
            pinned.definition.modulePolicy,
          ),
          resources: pinned.resources,
        };
      },
      resolveIdentity: async () => identity,
      resources: runtime.resources,
    });
    const actorRef = telemetry.actorRef(session.id);
    return createGameSdkOnlineRoomHttpHandlers({
      timing: method === "PATCH" ? timing : undefined,
      adapter,
      beforeMutation: (mutationRequest, _operation, roomCode) => (
        rateLimitResponseFor(
          mutationRequest,
          rateLimitPolicies.sdkRoomMutation,
          {
            playerId: session.id,
            creatorId: creatorSlug,
            packageId: `${creatorSlug}/${gameId}`,
            roomId: `${creatorSlug}/${gameId}/${roomCode}`,
            environment: "candidate-preview",
          },
        )
      ),
      onSuccess(operation, room, affected, command) {
        if (method === "GET") return;
        telemetry.success("game-sdk.preview-room", {
          action: operation,
          channel: "candidate-preview",
          packageRevision: room?.packageRevision
            ?? runtime.runtimeContract.packageRevision,
          packageRoot: runtime.runtimeContract.packageRootSha256,
          runtimeVersion: runtime.runtimeContract.runtimeVersion,
          roomSchemaVersion: runtime.runtimeContract.roomSchemaVersion,
          actorRef,
          ...(room ? {
            roomRef: telemetry.roomRef(room.code),
            phase: room.phase,
            revision: room.revision,
          } : {}),
          ...(affected === undefined ? {} : { affectedCount: affected }),
          ...(command ? {
            commandRef: telemetry.commandRef(command.commandId),
            commandRevision: command.commandRevision,
            applied: command.applied,
          } : {}),
        });
      },
      onError(operation, error, status) {
        telemetry.responseError("game-sdk.preview-room", error, status, {
          action: operation,
          channel: "candidate-preview",
          packageRevision: runtime.runtimeContract.packageRevision,
          actorRef,
        });
      },
    })[method](request).then((response) => {
      if (method !== "PATCH") return response;
      for (const entry of timing.finish()) {
        telemetry.info(
          "game-sdk.preview-command-timing",
          timing.observabilityFields(entry),
        );
      }
      return timing.decorate(response);
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PLAYER_AUTH_REQUIRED") {
      telemetry.responseError("game-sdk.preview-room", error, 401, {
        channel: "candidate-preview",
      });
      return json({ error: code }, 401);
    }
    telemetry.responseError("game-sdk.preview-room", error, 500, {
      channel: "candidate-preview",
    });
    return json({ error: "SDK_PREVIEW_RUNTIME_FAILED" }, 500);
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
