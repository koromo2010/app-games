import {
  developmentPrivateWorkspaceImportErrorStatus,
  isDevelopmentPrivateWorkspaceImportTarget,
} from "@/apps/sdk-portal/lib/development-private-workspace-import";
import { requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { isCanonicalDevelopmentPlatformRuntime } from "@/lib/sdk-migration-011-proxy";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: { params: Promise<{ target: string }> }) {
  try {
    await requireFullSiteAdminSession();
    const { target } = await context.params;
    if (
      sdkSupportEnvironment() !== "development"
      || !isCanonicalDevelopmentPlatformRuntime({
        semanticEnvironment: process.env.APP_ENV,
        vercelEnvironment: process.env.VERCEL_ENV,
        project: process.env.VERCEL_PROJECT_NAME,
        ref: process.env.VERCEL_GIT_COMMIT_REF,
      })
      || !isDevelopmentPrivateWorkspaceImportTarget(target)
      || new URL(request.url).search !== ""
    ) {
      return Response.json({ error: "DEVELOPMENT_PRIVATE_IMPORT_INPUT_INVALID" }, { status: 400, headers });
    }
    const url = new URL(
      `/api/internal/recovery/development-private-workspace-import/${encodeURIComponent(target)}/plan`,
      sdkPromotionInternalBaseUrl(),
    ).toString();
    const response = await fetch(url, {
      method: "GET",
      headers: sdkServiceHeaders("GET", url, { environment: "development" }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const error = typeof payload?.error === "string"
        ? payload.error
        : "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE";
      return Response.json({ error }, { status: response.status, headers });
    }
    if (
      payload?.schemaVersion !== 1
      || payload.environment !== "development"
      || payload.target !== target
      || payload.phase !== "target-state"
      || typeof payload.ready !== "boolean"
      || !payload.counts
      || !payload.integrity
    ) {
      return Response.json({ error: "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE" }, { status: 502, headers });
    }
    return Response.json(payload, { headers });
  } catch (error) {
    return siteAdminAuthorizationError(error) ?? Response.json({
      error: error instanceof Error ? error.message : "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE",
    }, { status: developmentPrivateWorkspaceImportErrorStatus(error), headers });
  }
}
