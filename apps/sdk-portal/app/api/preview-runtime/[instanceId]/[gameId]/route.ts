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
import { getGamePackageContractVersion } from "@/lib/game-package-contract-version";
import { normalizeGameSdkModuleProfile } from "@game-fields/game-sdk/modules";
import { parseGameSdkSettingDefinitions } from "@game-fields/game-sdk";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import platformRelease from "../../../../../../config/platform-release.json";

export const dynamic = "force-dynamic";
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const observedVersionDrift = new Set<string>();

function observeSdkContractVersionDrift(input: {
  creatorSlug: string;
  gameId: string;
  revision: string;
  serverBundleSha256: string;
  sdkContractVersion: number;
}) {
  if (input.sdkContractVersion >= platformRelease.sdkContractVersion) return;
  const key = [
    input.creatorSlug,
    input.gameId,
    input.revision,
    input.serverBundleSha256,
    input.sdkContractVersion,
    platformRelease.sdkContractVersion,
  ].join(":");
  if (observedVersionDrift.has(key)) return;
  observedVersionDrift.add(key);
  console.warn(JSON.stringify({
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    level: "warning",
    event: "game_sdk.bundle_contract_version_drift",
    service: "game-fields-sdk-portal",
    environment: process.env.VERCEL_GIT_COMMIT_REF === "main"
      ? "production"
      : "development",
    fields: {
      creatorSlug: input.creatorSlug,
      gameId: input.gameId,
      revision: input.revision,
      serverBundleSha256: input.serverBundleSha256,
      bundleSdkContractVersion: input.sdkContractVersion,
      platformSdkContractVersion: platformRelease.sdkContractVersion,
      rebuildRequired: true,
    },
  }));
}

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
    const sdkContractVersion = packageAccess
      ? await getGamePackageContractVersion({
          creatorSlug: instanceId,
          gameId,
          revision: game.packageRevision!,
        })
      : null;
    if (
      packageAccess
      && sdkContractVersion !== null
      && game.packageBundleSha256
    ) {
      observeSdkContractVersionDrift({
        creatorSlug: instanceId,
        gameId,
        revision: game.packageRevision!,
        serverBundleSha256: game.packageBundleSha256,
        sdkContractVersion,
      });
    }
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
        sdkContractVersion,
        platformSdkContractVersion: platformRelease.sdkContractVersion,
        sdkContractVersionDrift: sdkContractVersion !== null
          && sdkContractVersion < platformRelease.sdkContractVersion,
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
