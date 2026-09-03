import { readExactProductionOwnerRestorationAccounts } from "@/lib/player-owner-restoration-admin-store";
import {
  createProductionOwnerBindingWriteFreePlan,
  projectProductionOwnerRestorationAccount,
  requireProductionOwnerRestorationAccountFingerprint,
} from "@/lib/production-owner-restoration";
import {
  isCanonicalProductionPlatformRuntime,
  productionOwnerRestorationInternalUrl,
  productionPrivateWorkspaceImportRuntimeIdentity,
} from "@/lib/production-private-workspace-import-proxy";
import { requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const exactPath = "/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/plan";

const safePlanErrors = new Set([
  "OWNER_RESTORATION_ACCOUNT_NOT_FOUND",
  "OWNER_RESTORATION_ACCOUNT_AMBIGUOUS",
  "OWNER_RESTORATION_ACCOUNT_FINGERPRINT_CHANGED",
  "OWNER_RESTORATION_INTERNAL_AUTH_REJECTED",
  "OWNER_RESTORATION_WORKSPACE_NOT_FOUND",
  "OWNER_RESTORATION_WORKSPACE_UNAVAILABLE",
  "OWNER_RESTORATION_WORKSPACE_RESPONSE_INVALID",
  "OWNER_RESTORATION_PLAN_INPUT_INVALID",
]);

function safeError(code: string, status = 409) {
  const error = safePlanErrors.has(code) ? code : "OWNER_RESTORATION_PLAN_UNAVAILABLE";
  return Response.json({ error }, { status: error === "OWNER_RESTORATION_PLAN_UNAVAILABLE" ? 503 : status, headers });
}

export async function GET(request: Request) {
  try {
    await requireFullSiteAdminSession();
    const incoming = new URL(request.url);
    if (incoming.pathname !== exactPath || incoming.search || request.method !== "GET") {
      return Response.json({ error: "OWNER_RESTORATION_INPUT_INVALID" }, { status: 400, headers });
    }
    const environment = sdkSupportEnvironment();
    if (
      environment !== "production"
      || !isCanonicalProductionPlatformRuntime(productionPrivateWorkspaceImportRuntimeIdentity())
    ) return safeError("OWNER_RESTORATION_PLAN_INPUT_INVALID", 400);
    const account = projectProductionOwnerRestorationAccount({
      accounts: await readExactProductionOwnerRestorationAccounts(),
      environment,
      secret: process.env.SDK_ACCOUNT_LINK_SECRET ?? "",
    });
    requireProductionOwnerRestorationAccountFingerprint({
      environment,
      fingerprint: account.fingerprint,
    });
    const url = productionOwnerRestorationInternalUrl();
    const response = await fetch(url, {
      method: "GET",
      headers: sdkServiceHeaders("GET", url, { environment }),
      cache: "no-store",
    });
    const workspace = await response.json().catch(() => null);
    if (!response.ok) {
      const code = response.status === 403 ? "OWNER_RESTORATION_INTERNAL_AUTH_REJECTED"
        : response.status === 404 ? "OWNER_RESTORATION_WORKSPACE_NOT_FOUND"
          : "OWNER_RESTORATION_WORKSPACE_UNAVAILABLE";
      return safeError(code, response.status === 404 ? 404 : response.status === 403 ? 403 : 503);
    }
    if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
      return safeError("OWNER_RESTORATION_WORKSPACE_RESPONSE_INVALID", 502);
    }
    try {
      return Response.json(createProductionOwnerBindingWriteFreePlan({
        account,
        workspace: workspace as Parameters<typeof createProductionOwnerBindingWriteFreePlan>[0]["workspace"],
        environment,
        secret: process.env.SDK_ACCOUNT_LINK_SECRET ?? "",
      }), { headers });
    } catch (error) {
      return safeError(error instanceof Error ? error.message : "", 409);
    }
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    const code = error instanceof Error ? error.message : "";
    const status = code === "OWNER_RESTORATION_ACCOUNT_NOT_FOUND" ? 404
      : code === "OWNER_RESTORATION_ACCOUNT_AMBIGUOUS" ? 409
        : 503;
    return safeError(code, status);
  }
}
