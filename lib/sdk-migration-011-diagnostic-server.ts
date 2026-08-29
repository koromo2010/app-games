import "server-only";

import { randomUUID } from "node:crypto";
import {
  loadSdkMigration011DiagnosticPageModel,
  type SdkMigration011DiagnosticProxyDependencies,
} from "@/lib/sdk-migration-011-diagnostic-proxy";
import { requireRecentSiteAdminMfa, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { sdkPortalInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkMigration011DiagnosticHeaders } from "@/lib/sdk-service-auth";

export function sdkMigration011DiagnosticServerDependencies(): SdkMigration011DiagnosticProxyDependencies {
  return {
    requireRecentMfa: async () => { await requireRecentSiteAdminMfa(); },
    authorizationError: siteAdminAuthorizationError,
    runtimeIdentity: () => ({
      semanticEnvironment: process.env.APP_ENV,
      vercelEnvironment: process.env.VERCEL_ENV,
      project: process.env.VERCEL_PROJECT_NAME,
      ref: process.env.VERCEL_GIT_COMMIT_REF,
    }),
    targetUrl: () => new URL(
      "/api/internal/operations/migration-011/diagnostic",
      sdkPortalInternalBaseUrl(),
    ).toString(),
    operationIdentity: () => ({ operationId: randomUUID(), nonce: randomUUID() }),
    operationHeaders: sdkMigration011DiagnosticHeaders,
    fetchTarget: fetch,
  };
}

export function loadSdkMigration011DiagnosticPage() {
  return loadSdkMigration011DiagnosticPageModel(
    sdkMigration011DiagnosticServerDependencies(),
  );
}
