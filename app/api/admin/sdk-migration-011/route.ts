import { randomUUID } from "node:crypto";
import {
  requireRecentSiteAdminMfa,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import { proxySdkMigration011Operator } from "@/lib/sdk-migration-011-proxy";
import { sdkPortalInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkMigration011OperationHeaders } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxySdkMigration011Operator(request, {
    requireRecentMfa: async () => {
      await requireRecentSiteAdminMfa();
    },
    authorizationError: siteAdminAuthorizationError,
    runtimeIdentity: () => ({
      semanticEnvironment: process.env.APP_ENV,
      vercelEnvironment: process.env.VERCEL_ENV,
      project: process.env.VERCEL_PROJECT_NAME,
      ref: process.env.VERCEL_GIT_COMMIT_REF,
    }),
    targetUrl: () => new URL(
      "/api/internal/operations/migration-011",
      sdkPortalInternalBaseUrl(),
    ).toString(),
    operationIdentity: () => ({
      operationId: randomUUID(),
      nonce: randomUUID(),
    }),
    operationHeaders: sdkMigration011OperationHeaders,
    fetchTarget: fetch,
  });
}
