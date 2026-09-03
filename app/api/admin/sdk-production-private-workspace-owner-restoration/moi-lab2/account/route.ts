import { readExactProductionOwnerRestorationAccounts } from "@/lib/player-owner-restoration-admin-store";
import { projectProductionOwnerRestorationAccount } from "@/lib/production-owner-restoration";
import { requireFullSiteAdminSession, siteAdminAuthorizationError } from "@/lib/site-admin-auth";
import { sdkSupportEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const exactPath = "/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/account";

export async function GET(request: Request) {
  try {
    await requireFullSiteAdminSession();
    const url = new URL(request.url);
    if (url.pathname !== exactPath || url.search || request.method !== "GET") {
      return Response.json({ error: "OWNER_RESTORATION_INPUT_INVALID" }, { status: 400, headers });
    }
    return Response.json(projectProductionOwnerRestorationAccount({
      accounts: await readExactProductionOwnerRestorationAccounts(),
      environment: sdkSupportEnvironment(),
      secret: process.env.SDK_ACCOUNT_LINK_SECRET ?? "",
    }), { headers });
  } catch (error) {
    const auth = siteAdminAuthorizationError(error);
    if (auth) return auth;
    const code = error instanceof Error ? error.message : "";
    const status = code === "OWNER_RESTORATION_ACCOUNT_NOT_FOUND" ? 404
      : code === "OWNER_RESTORATION_ACCOUNT_AMBIGUOUS" ? 409
        : 503;
    const safe = status === 404 || status === 409 ? code : "OWNER_RESTORATION_ACCOUNT_UNAVAILABLE";
    return Response.json({ error: safe }, { status, headers });
  }
}
