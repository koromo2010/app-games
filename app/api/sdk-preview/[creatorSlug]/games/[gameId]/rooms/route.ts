import { createGameSdkOnlineRoomHttpHandlers } from "@/lib/game-sdk-online-room-http";
import { createAuthenticatedGameSdkPlatformAdapter } from "@/lib/game-sdk-platform-adapter";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { requireSdkPreviewAuthenticatedPlayer } from "@/lib/sdk-preview-account-session";
import { loadSdkPreviewPackageModule } from "@/lib/sdk-preview-package-runtime";

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
  try {
    const { creatorSlug, gameId } = await context.params;
    const session = await requireSdkPreviewAuthenticatedPlayer(creatorSlug);
    const limited = await rateLimitResponseFor(
      request,
      method === "GET"
        ? rateLimitPolicies.sdkRuntimeRead
        : rateLimitPolicies.roomMutation,
      { playerId: session.id },
    );
    if (limited) return limited;
    const runtime = await loadSdkPreviewPackageModule({
      creatorSlug,
      gameId,
      request,
      playerId: session.id,
    });
    if (!runtime) {
      return json({ error: "SDK_PREVIEW_PACKAGE_NOT_AVAILABLE" }, 404);
    }
    const identity = {
      playerId: session.id,
      displayName: session.name?.trim() || "SDK Player",
      debugAccess: false,
    };
    const adapter = createAuthenticatedGameSdkPlatformAdapter({
      module: runtime.module,
      resolveIdentity: async () => identity,
      resources: runtime.resources,
    });
    return createGameSdkOnlineRoomHttpHandlers({ adapter })[method](request);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PLAYER_AUTH_REQUIRED") {
      return json({ error: code }, 401);
    }
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
