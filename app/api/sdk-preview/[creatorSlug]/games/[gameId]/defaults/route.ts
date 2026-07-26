import {
  loadGameSdkPlayerDefaults,
  saveGameSdkPlayerDefaults,
} from "@/lib/game-sdk-player-defaults-store";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { requireSdkPreviewAuthenticatedPlayer } from "@/lib/sdk-preview-account-session";
import { sdkPreviewPackageRuntimeId } from "@/lib/sdk-preview-package-runtime";
import { loadSdkPreviewRuntimeDefinition } from "@/lib/sdk-preview-runtime-source";
import { gameSdkModuleIsRequired } from "@game-fields/game-sdk/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ creatorSlug: string; gameId: string }>;
};

async function target(context: RouteContext) {
  const { creatorSlug, gameId } = await context.params;
  const [player, definition] = await Promise.all([
    requireSdkPreviewAuthenticatedPlayer(creatorSlug),
    loadSdkPreviewRuntimeDefinition(creatorSlug, gameId),
  ]);
  if (
    !definition
    || definition.runtimeKind !== "package"
    || !gameSdkModuleIsRequired(definition.modulePolicy, "room-settings")
  ) {
    return null;
  }
  return {
    creatorSlug,
    gameId,
    player,
    definitions: definition.settings,
    storageGameId: sdkPreviewPackageRuntimeId(creatorSlug, gameId),
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const resolved = await target(context);
  if (!resolved) {
    return Response.json(
      { error: "SDK_PREVIEW_SETTINGS_NOT_AVAILABLE" },
      { status: 404 },
    );
  }
  const settings = await loadGameSdkPlayerDefaults(
    resolved.player.id,
    resolved.storageGameId,
    resolved.definitions,
  );
  return Response.json({ settings }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const resolved = await target(context);
  if (!resolved) {
    return Response.json(
      { error: "SDK_PREVIEW_SETTINGS_NOT_AVAILABLE" },
      { status: 404 },
    );
  }
  const limited = await rateLimitResponseFor(
    request,
    rateLimitPolicies.roomMutation,
    {
      playerId: resolved.player.id,
      creatorId: resolved.creatorSlug,
      packageId: `${resolved.creatorSlug}/${resolved.gameId}`,
      environment: "candidate-preview",
    },
  );
  if (limited) return limited;
  const body = await request.json().catch(() => null) as {
    settings?: unknown;
  } | null;
  const settings = await saveGameSdkPlayerDefaults(
    resolved.player.id,
    resolved.storageGameId,
    resolved.definitions,
    body?.settings,
  );
  return Response.json({ settings }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
