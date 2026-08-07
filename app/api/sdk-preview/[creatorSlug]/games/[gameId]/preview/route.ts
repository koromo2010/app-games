import {
  type GameSdkStoredRoom,
  type GameSdkTrustedActor,
} from "@game-fields/game-sdk";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import type { GameSdkRuntimeTiming } from "@game-fields/game-sdk/runtime";
import {
  getSdkPreviewAccountPlayerId,
  requireSdkPreviewAuthenticatedPlayer,
} from "@/lib/sdk-preview-account-session";
import { playerHasDebugAccess } from "@/lib/debug-access";
import { gameSdkModuleIsRequired } from "@game-fields/game-sdk/modules";
import { loadSdkPreviewPackageModule } from "@/lib/sdk-preview-package-runtime";
import {
  createSdkPreviewPackageRouteHandler,
  type SdkPreviewPackageRouteTarget,
} from "@/lib/sdk-preview-package-route-handler";
import type { SdkPreviewPackageSessionScope } from "@/lib/sdk-preview-package-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ creatorSlug: string; gameId: string }>;
};

type PreviewTarget = SdkPreviewPackageRouteTarget & {
  module: NonNullable<Awaited<ReturnType<typeof loadSdkPreviewPackageModule>>>;
};

function errorResponse(payload: unknown, status: number) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function target(
  request: Request,
  context: RouteContext,
): Promise<PreviewTarget | Response> {
  const { creatorSlug, gameId } = await context.params;
  const revision = new URL(request.url).searchParams.get("revision")?.trim() ?? "";
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    return errorResponse({ error: "SDK_PREVIEW_PACKAGE_NOT_AVAILABLE" }, 400);
  }
  let session;
  try {
    session = await requireSdkPreviewAuthenticatedPlayer(creatorSlug);
  } catch {
    return errorResponse({ error: "PLAYER_AUTH_REQUIRED" }, 401);
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
    return errorResponse({ error: "SDK_PREVIEW_PACKAGE_NOT_AVAILABLE" }, 404);
  }
  const debugAccess = creatorPlayerId === session.id
    || await playerHasDebugAccess(session.id);
  const debugEnabled = Boolean(
    packageRuntime.definition.manifest?.supportsDebug === true
    && gameSdkModuleIsRequired(packageRuntime.definition.modulePolicy, "debug")
  );
  return {
    creatorSlug,
    gameId,
    scope: { creatorSlug, gameId, revision } satisfies SdkPreviewPackageSessionScope,
    actor: {
      playerId: session.id,
      displayName: session.name?.trim() || "SDK Player",
      role: "host",
      debugAccess: debugAccess && debugEnabled,
    } satisfies GameSdkTrustedActor,
    debugEnabled,
    module: packageRuntime,
  };
}

function previewRuntime(
  targetValue: SdkPreviewPackageRouteTarget,
  initialRoom?: GameSdkStoredRoom,
  timing?: GameSdkRuntimeTiming,
) {
  const packageRuntime = targetValue.module as PreviewTarget["module"];
  return createGameSdkMockRuntime({
    module: packageRuntime.module,
    ...(initialRoom ? { initialRooms: [initialRoom] } : {}),
    resources: packageRuntime.resources,
    timing,
  });
}

const handle = createSdkPreviewPackageRouteHandler({
  resolveTarget: target,
  createRuntime: previewRuntime,
});

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
