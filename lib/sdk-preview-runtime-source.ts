import type { GameSdkModuleProfile } from "@game-fields/game-sdk/modules";

export const sdkPreviewCreatorSlugPattern =
  /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
export const sdkPreviewGameIdPattern =
  /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export type SdkPreviewRuntimeDefinition = {
  title: string;
  runtimeUrl: string;
  modulePolicy?: GameSdkModuleProfile;
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

export async function loadSdkPreviewRuntimeDefinition(
  creatorSlug: string,
  gameId: string,
  fetchRuntime: typeof fetch = fetch,
): Promise<SdkPreviewRuntimeDefinition | null> {
  if (
    !sdkPreviewCreatorSlugPattern.test(creatorSlug)
    || !sdkPreviewGameIdPattern.test(gameId)
  ) {
    return null;
  }
  const response = await fetchRuntime(
    `${sdkPortalInternalBaseUrl()}/api/preview-runtime/${creatorSlug}/${gameId}`,
    { cache: "no-store" },
  );
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
  return {
    title: payload.title.trim(),
    runtimeUrl: payload.runtimeUrl.trim(),
    modulePolicy: payload.modulePolicy,
  };
}
