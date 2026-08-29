import {
  developmentPrivateWorkspaceImportErrorStatus,
  isDevelopmentPrivateWorkspaceImportTarget,
  readDevelopmentPrivateWorkspaceImportBody,
} from "@/apps/sdk-portal/lib/development-private-workspace-import";
import { requireRecentSiteAdminMfa, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ target: string }> }) {
  try {
    await requireRecentSiteAdminMfa();
    const { target } = await context.params;
    if (
      sdkSupportEnvironment() !== "development"
      || !isDevelopmentPrivateWorkspaceImportTarget(target)
      || new URL(request.url).search !== ""
    ) {
      return Response.json({ error: "DEVELOPMENT_PRIVATE_IMPORT_INPUT_INVALID" }, { status: 400, headers });
    }
    const archive = await readDevelopmentPrivateWorkspaceImportBody(request, target);
    const url = new URL(
      `/api/internal/recovery/development-private-workspace-import/${encodeURIComponent(target)}/plan`,
      sdkPromotionInternalBaseUrl(),
    ).toString();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...sdkServiceHeaders("POST", url, { environment: "development" }),
        "Content-Type": "application/zip",
      },
      body: archive,
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
      payload?.environment !== "development"
      || payload.target !== target
      || payload.phase !== "plan"
      || payload.writesPerformed !== 0
      || typeof payload.planReceipt !== "string"
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
