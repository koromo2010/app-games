import {
  requireRecentSiteAdminMfa,
  siteAdminAuthorizationError,
} from "@/lib/site-admin-auth";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { expectedAppEnvironment } from "@/lib/storage-environment-guard";
import {
  originalDataPreservationInternalPath,
  proxyOriginalDataPreservation,
} from "@/lib/original-data-preservation-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  return proxyOriginalDataPreservation(request, {
    requireRecentMfa: requireRecentSiteAdminMfa,
    authorizationError: siteAdminAuthorizationError,
    runtimeIdentity: () => ({
      environment: expectedAppEnvironment() === "production"
        && process.env.APP_ENV === "production"
        ? "production" as const
        : "development" as const,
      sourceRef: process.env.VERCEL_GIT_COMMIT_REF?.trim() ?? "",
      sourceMainCommit: process.env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "",
    }),
    targetUrl: () => new URL(
      originalDataPreservationInternalPath,
      sdkPromotionInternalBaseUrl(),
    ).toString(),
    serviceHeaders: (url) => sdkServiceHeaders("POST", url, { environment: "production" }),
    fetchTarget: fetch,
  });
}
