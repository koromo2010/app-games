import {
  getCreatorGamePackageRevision,
  getCreatorGamePreview,
  normalizeInstanceSlug,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import {
  createPackageRuntimeAccess,
  createPreviewRuntimeUrl,
} from "@/lib/preview-links";
import { normalizeGameSdkModuleProfile } from "@game-fields/game-sdk/modules";
import { parseGameSdkSettingDefinitions } from "@game-fields/game-sdk";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export async function GET(request: Request, { params }: { params: Promise<{ instanceId: string; gameId: string }> }) {
  try {
    requireSdkServiceRequest(request);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const raw = await params;
  const instanceId = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  if (validateInstanceSlug(instanceId) || !GAME_PATTERN.test(gameId)) return Response.json({ error: "not_found" }, { status: 404 });
  const requestedRevision = new URL(request.url).searchParams.get("revision");
  if (requestedRevision && !/^[a-f0-9]{40}$/.test(requestedRevision)) {
    return Response.json({ error: "revision_invalid" }, { status: 400 });
  }
  const game = await (
    requestedRevision
      ? getCreatorGamePackageRevision(instanceId, gameId, requestedRevision)
      : getCreatorGamePreview(instanceId, gameId)
  ).catch(() => null);
  if (!game) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const packageAccess = game.packageRevision
      ? createPackageRuntimeAccess({
          instanceId,
          gameId,
          revision: game.packageRevision,
          serverBundleSha256: game.packageBundleSha256!,
        })
      : null;
    return Response.json({
      title: game.title,
      runtimeKind: packageAccess ? "package" : "mock",
      runtimeUrl: packageAccess?.clientRuntimeUrl ?? createPreviewRuntimeUrl({
        instanceId,
        gameId,
        revision: game.mockRevision!,
      }),
      revision: game.packageRevision ?? game.mockRevision,
      manifest: game.manifest,
      ...(packageAccess ? {
        serverRuntimeUrl: packageAccess.serverRuntimeUrl,
        serverRuntimeToken: packageAccess.serverRuntimeToken,
        serverRuntimeExpiresAt: packageAccess.expiresAt,
        serverBundleSha256: game.packageBundleSha256,
        appSetSourceSha256: game.packageAppSetSha256,
        packageRootSha256: game.packageRootSha256,
      } : {}),
      modulePolicy: normalizeGameSdkModuleProfile(game.modulePolicy),
      settings: parseGameSdkSettingDefinitions(
        game.manifest && typeof game.manifest === "object"
          ? (game.manifest as { settings?: unknown }).settings
          : undefined,
        { legacyTimeLimitFallback: true },
      ),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "preview_unavailable" }, { status: 503 });
  }
}
