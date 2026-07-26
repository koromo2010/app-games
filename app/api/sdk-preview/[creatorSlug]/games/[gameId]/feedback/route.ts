import { normalizeGameSdkModuleProfile } from "@game-fields/game-sdk/modules";
import { loadGameSdkFeedbackArtifacts } from "@/lib/game-sdk-feedback-store";
import { createAuthenticatedGameSdkPlatformAdapter } from "@/lib/game-sdk-platform-adapter";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { requireSdkPreviewAuthenticatedPlayer } from "@/lib/sdk-preview-account-session";
import { loadSdkPreviewPackageModule } from "@/lib/sdk-preview-package-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ creatorSlug: string; gameId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { creatorSlug, gameId } = await context.params;
    const session = await requireSdkPreviewAuthenticatedPlayer(creatorSlug);
    const limited = await rateLimitResponseFor(
      request,
      rateLimitPolicies.sdkRuntimeRead,
      { playerId: session.id },
    );
    if (limited) return limited;
    const runtime = await loadSdkPreviewPackageModule({
      creatorSlug,
      gameId,
      request,
      playerId: session.id,
    });
    const moduleProfile = runtime?.definition
      ? normalizeGameSdkModuleProfile(runtime.definition.modulePolicy)
      : null;
    if (
      !runtime
      || !runtime.definition.manifest?.usesLlm
      || moduleProfile?.llm.mode !== "required"
      || moduleProfile.feedback.mode !== "required"
    ) {
      return Response.json({ artifacts: [] }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const roomCode = new URL(request.url).searchParams.get("roomCode")
      ?.trim().toUpperCase() ?? "";
    if (!roomCode) {
      return Response.json({ error: "ROOM_CODE_REQUIRED" }, { status: 400 });
    }
    const identity = {
      playerId: session.id,
      displayName: session.name?.trim() || "SDK Player",
      debugAccess: true,
    };
    const adapter = createAuthenticatedGameSdkPlatformAdapter({
      module: runtime.module,
      moduleProfile: moduleProfile ?? undefined,
      environment: "candidate-preview",
      roomScopeId: runtime.roomScopeId,
      runtimeContract: runtime.runtimeContract,
      async resolveRuntime(contract) {
        const pinned = await loadSdkPreviewPackageModule({
          creatorSlug,
          gameId,
          request,
          playerId: session.id,
          revision: contract.packageRevision,
        });
        if (!pinned) return null;
        return {
          module: pinned.module,
          runtimeContract: pinned.runtimeContract,
          moduleProfile: normalizeGameSdkModuleProfile(
            pinned.definition.modulePolicy,
          ),
          resources: pinned.resources,
        };
      },
      resolveIdentity: async () => identity,
      resources: runtime.resources,
    });
    const room = await adapter.readRoom(roomCode);
    const common = room?.view && typeof room.view === "object"
      ? (room.view as { common?: { isMember?: unknown } }).common
      : undefined;
    if (
      !room
      || room.phase !== "result"
      || common?.isMember !== true
    ) {
      return Response.json({ error: "FEEDBACK_ACCESS_DENIED" }, {
        status: 403,
      });
    }
    return Response.json({
      artifacts: await loadGameSdkFeedbackArtifacts({
        runtimeId: runtime.roomScopeId,
        roomCode: room.code,
        environment: "candidate-preview",
      }),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "PLAYER_AUTH_REQUIRED"
    ) {
      return Response.json({ error: "PLAYER_AUTH_REQUIRED" }, { status: 401 });
    }
    return Response.json({ error: "FEEDBACK_UNAVAILABLE" }, { status: 503 });
  }
}
