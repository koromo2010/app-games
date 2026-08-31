import type { ProductionPrivateWorkspaceImportRuntimeIdentity } from "./production-private-workspace-import-page-access.ts";

const productionSdkOrigin = "https://sdk.game-fields.com";

export function isCanonicalProductionPlatformRuntime(
  identity: ProductionPrivateWorkspaceImportRuntimeIdentity,
) {
  return identity.semanticEnvironment === "production"
    && identity.vercelEnvironment === "production"
    && identity.project === "app-games"
    && identity.ref === "main";
}

export function productionPrivateWorkspaceImportInternalUrl(path: string) {
  const url = new URL(path, productionSdkOrigin);
  if (url.origin !== productionSdkOrigin || !url.pathname.startsWith("/api/internal/recovery/production-private-workspace-import/")) {
    throw new Error("PRODUCTION_PRIVATE_IMPORT_TARGET_INVALID");
  }
  return url.toString();
}

export function productionPrivateWorkspaceImportRuntimeIdentity() {
  return {
    semanticEnvironment: process.env.APP_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
    project: process.env.VERCEL_PROJECT_NAME,
    ref: process.env.VERCEL_GIT_COMMIT_REF,
  };
}
