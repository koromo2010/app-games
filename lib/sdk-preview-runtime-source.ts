import type { GameSdkModuleProfile } from "@game-fields/game-sdk/modules";
import {
  assertGameManifest,
  parseGameSdkSettingDefinitions,
  type GameSdkManifest,
  type GameSdkSettingDefinition,
} from "@game-fields/game-sdk";
import { sdkServiceHeaders } from "./sdk-service-auth.ts";

export const sdkPreviewCreatorSlugPattern =
  /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
export const sdkPreviewGameIdPattern =
  /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export type SdkPreviewRuntimeDefinition = {
  title: string;
  runtimeUrl: string;
  runtimeKind: "mock" | "package";
  revision?: string;
  manifest?: GameSdkManifest;
  serverRuntimeUrl?: string;
  serverRuntimeToken?: string;
  serverRuntimeExpiresAt?: number;
  serverBundleSha256?: string;
  appSetSourceSha256?: string;
  modulePolicy?: GameSdkModuleProfile;
  settings: GameSdkSettingDefinition[];
};

export function sdkPortalInternalBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.SDK_PORTAL_INTERNAL_URL?.replace(/\/$/, "")
    ?? (
      env.VERCEL_GIT_COMMIT_REF === "main"
        ? "https://sdk.game-fields.com"
        : "https://sdk-dev.game-fields.com"
    );
}

export function sdkPreviewRuntimeBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.SDK_PREVIEW_BASE_URL?.replace(/\/$/, "")
    ?? (
      env.VERCEL_GIT_COMMIT_REF === "main"
        ? "https://preview.game-fields.com"
        : "https://preview-dev.game-fields.com"
    );
}

export function isSdkPreviewRuntimeUrl(
  value: unknown,
  expectedPath: string,
  options?: {
    allowTokenQuery?: boolean;
    env?: NodeJS.ProcessEnv;
  },
) {
  if (typeof value !== "string") return false;
  try {
    const actual = new URL(value);
    const expected = new URL(sdkPreviewRuntimeBaseUrl(options?.env));
    if (
      actual.origin !== expected.origin
      || actual.pathname !== expectedPath
      || actual.username
      || actual.password
      || actual.hash
    ) return false;
    if (!options?.allowTokenQuery) return actual.search === "";
    const entries = [...actual.searchParams.entries()];
    return entries.length === 1
      && entries[0]?.[0] === "token"
      && Boolean(entries[0]?.[1]);
  } catch {
    return false;
  }
}

export async function loadSdkPreviewRuntimeDefinition(
  creatorSlug: string,
  gameId: string,
  fetchRuntime: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SdkPreviewRuntimeDefinition | null> {
  if (
    !sdkPreviewCreatorSlugPattern.test(creatorSlug)
    || !sdkPreviewGameIdPattern.test(gameId)
  ) {
    return null;
  }
  const url = `${sdkPortalInternalBaseUrl(env)}/api/preview-runtime/${creatorSlug}/${gameId}`;
  const response = await fetchRuntime(url, {
    cache: "no-store",
    ...(fetchRuntime === fetch
      ? { headers: sdkServiceHeaders("GET", url) }
      : {}),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("SDK_PREVIEW_RUNTIME_UNAVAILABLE");
  const payload = await response.json() as Partial<SdkPreviewRuntimeDefinition>;
  if (
    typeof payload.title !== "string"
    || !payload.title.trim()
    || typeof payload.runtimeUrl !== "string"
    || !payload.runtimeUrl.trim()
  ) {
    throw new Error("SDK_PREVIEW_RUNTIME_INVALID");
  }
  const runtimeKind = payload.runtimeKind === "package" ? "package" : "mock";
  if (runtimeKind === "package") {
    if (
      typeof payload.revision !== "string"
      || !/^[a-f0-9]{40}$/.test(payload.revision)
      || !payload.manifest
      || typeof payload.serverRuntimeToken !== "string"
      || !payload.serverRuntimeToken
      || typeof payload.serverRuntimeExpiresAt !== "number"
      || payload.serverRuntimeExpiresAt <= Date.now()
      || typeof payload.serverBundleSha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(payload.serverBundleSha256)
      || typeof payload.appSetSourceSha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(payload.appSetSourceSha256)
    ) {
      throw new Error("SDK_PREVIEW_PACKAGE_RUNTIME_INVALID");
    }
    if (
      !isSdkPreviewRuntimeUrl(
        payload.runtimeUrl,
        `/package-open/${creatorSlug}/${gameId}/${payload.revision}`,
        { allowTokenQuery: true, env },
      )
      || !isSdkPreviewRuntimeUrl(
        payload.serverRuntimeUrl,
        `/server/${creatorSlug}/${gameId}/${payload.revision}`,
        { env },
      )
    ) {
      throw new Error("SDK_PREVIEW_PACKAGE_RUNTIME_INVALID");
    }
    assertGameManifest(payload.manifest);
    if (payload.manifest.id !== gameId) {
      throw new Error("SDK_PREVIEW_PACKAGE_GAME_ID_MISMATCH");
    }
  }
  return {
    title: payload.title.trim(),
    runtimeUrl: payload.runtimeUrl.trim(),
    runtimeKind,
    ...(runtimeKind === "package" ? {
      revision: payload.revision,
      manifest: payload.manifest,
      serverRuntimeUrl: payload.serverRuntimeUrl,
      serverRuntimeToken: payload.serverRuntimeToken,
      serverRuntimeExpiresAt: payload.serverRuntimeExpiresAt,
      serverBundleSha256: payload.serverBundleSha256,
      appSetSourceSha256: payload.appSetSourceSha256,
    } : {}),
    modulePolicy: payload.modulePolicy,
    settings: parseGameSdkSettingDefinitions(payload.settings, {
      legacyTimeLimitFallback: true,
    }),
  };
}
