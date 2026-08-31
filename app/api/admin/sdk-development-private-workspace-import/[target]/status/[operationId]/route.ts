import {
  isDevelopmentPrivateWorkspaceImportTarget,
} from "@/apps/sdk-portal/lib/development-private-workspace-import-public-contract";
import { parseDevelopmentPrivateWorkspaceImportStatus } from "@/lib/development-private-workspace-import-client";
import { requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { isCanonicalDevelopmentPlatformRuntime } from "@/lib/sdk-migration-011-proxy";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ target: string; operationId: string }> },
) {
  try {
    await requireFullSiteAdminSession();
    const { target, operationId } = await context.params;
    if (
      !isCanonicalDevelopmentPlatformRuntime({
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
    const planReceipt = request.headers.get("x-game-fields-private-import-plan-receipt") ?? "";
    const bundleSha256 = request.headers.get("x-game-fields-private-import-bundle-sha256") ?? "";
    const url = new URL(
      `/api/internal/recovery/development-private-workspace-import/${encodeURIComponent(target)}/status/${encodeURIComponent(operationId)}`,
      sdkPromotionInternalBaseUrl(),
    ).toString();
    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...sdkServiceHeaders("GET", url, { environment: "development" }),
        "X-Game-Fields-Private-Import-Plan-Receipt": planReceipt,
        "X-Game-Fields-Private-Import-Bundle-Sha256": bundleSha256,
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    const parsed = parseDevelopmentPrivateWorkspaceImportStatus(payload, target, operationId.toLowerCase());
    if (response.status === 404 && parsed?.state === "not-found") {
      return Response.json(payload, { status: 404, headers });
    }
    if (!response.ok) {
      const error = typeof payload?.error === "string"
        ? payload.error
        : "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE";
      return Response.json({ error }, { status: response.status, headers });
    }
    if (parsed?.state !== "completed") {
      return Response.json({ error: "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE" }, { status: 502, headers });
    }
    return Response.json(payload, { headers });
  } catch (error) {
    return siteAdminAuthorizationError(error) ?? Response.json({
      error: "DEVELOPMENT_PRIVATE_IMPORT_UNAVAILABLE",
    }, { status: 503, headers });
  }
}
