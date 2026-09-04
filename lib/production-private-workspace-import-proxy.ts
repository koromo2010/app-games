import type { ProductionPrivateWorkspaceImportRuntimeIdentity } from "./production-private-workspace-import-page-access.ts";

const productionSdkOrigin = "https://sdk.game-fields.com";
const developmentSdkOrigin = "https://sdk-dev.game-fields.com";
const productionOwnerRestorationStatePath =
  "/api/internal/recovery/production-private-workspace-owner-restoration/moi-lab2/state";
const productionOwnerRestorationDiagnosticPath =
  "/api/internal/recovery/production-private-workspace-owner-restoration/moi-lab2/completed-import-diagnostic";

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

export function productionOwnerRestorationInternalUrl() {
  const url = new URL(productionOwnerRestorationStatePath, productionSdkOrigin);
  if (url.origin !== productionSdkOrigin || url.pathname !== productionOwnerRestorationStatePath) {
    throw new Error("OWNER_RESTORATION_TARGET_INVALID");
  }
  return url.toString();
}

/** Exact internal target for the read-only completed-import diagnostic only. */
export function productionOwnerRestorationDiagnosticInternalUrl(environment: "production" | "development") {
  const origin = environment === "production" ? productionSdkOrigin : developmentSdkOrigin;
  const url = new URL(productionOwnerRestorationDiagnosticPath, origin);
  if (
    url.origin !== origin
    || url.pathname !== productionOwnerRestorationDiagnosticPath
    || url.search
  ) throw new Error("OWNER_RESTORATION_DIAGNOSTIC_TARGET_INVALID");
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
