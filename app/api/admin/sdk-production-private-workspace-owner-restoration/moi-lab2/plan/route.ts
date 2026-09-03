import { readExactProductionOwnerRestorationAccounts } from "@/lib/player-owner-restoration-admin-store";
import {
  createProductionOwnerBindingWriteFreePlan,
  projectProductionOwnerRestorationAccount,
} from "@/lib/production-owner-restoration";
import { requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { sdkPromotionInternalBaseUrl } from "@/lib/sdk-preview-runtime-source";
import { sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const exactPath = "/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/plan";

export async function GET(request: Request) {
  try {
    await requireFullSiteAdminSession();
    const incoming = new URL(request.url);
    if (incoming.pathname !== exactPath || incoming.search || request.method !== "GET") {
      return Response.json({ error: "OWNER_RESTORATION_INPUT_INVALID" }, { status: 400, headers });
    }
    const environment = sdkSupportEnvironment();
    const account = projectProductionOwnerRestorationAccount({
      accounts: await readExactProductionOwnerRestorationAccounts(),
      environment,
      secret: process.env.SDK_ACCOUNT_LINK_SECRET ?? "",
    });
    const target = new URL(
      "/api/internal/recovery/production-private-workspace-owner-restoration/moi-lab2/state",
      sdkPromotionInternalBaseUrl(),
    );
    const url = target.toString();
    const response = await fetch(url, {
      method: "GET",
      headers: sdkServiceHeaders("GET", url, { environment }),
      cache: "no-store",
    });
    const workspace = await response.json().catch(() => null);
    if (!response.ok || !workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
      return Response.json({ error: "OWNER_RESTORATION_WORKSPACE_UNAVAILABLE" }, { status: 503, headers });
    }
    return Response.json(createProductionOwnerBindingWriteFreePlan({
      account,
      workspace: workspace as Parameters<typeof createProductionOwnerBindingWriteFreePlan>[0]["workspace"],
      environment,
      secret: process.env.SDK_ACCOUNT_LINK_SECRET ?? "",
    }), { headers });
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    return Response.json({ error: "OWNER_RESTORATION_PLAN_UNAVAILABLE" }, { status: 503, headers });
  }
}
