import { randomUUID } from "node:crypto";
import {
  requireRecentSiteAdminMfa,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import { proxySdkMigration010Operator } from "@/lib/sdk-migration-010-proxy";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkMigration010OperationHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxySdkMigration010Operator(request, {
    requireRecentMfa: async () => {
      await requireRecentSiteAdminMfa();
    },
    authorizationError: siteAdminAuthorizationError,
    environment: () => sdkSupportEnvironment(),
    targetUrl: () => new URL(
      "/api/internal/operations/migration-010",
      sdkPromotionInternalBaseUrl(),
    ).toString(),
    operationIdentity: () => ({
      operationId: randomUUID(),
      nonce: randomUUID(),
    }),
    operationHeaders: sdkMigration010OperationHeaders,
    fetchTarget: fetch,
  });
}
