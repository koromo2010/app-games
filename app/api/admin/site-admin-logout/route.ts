import {
  createSiteAdminLogoutRedirect,
  validateSiteAdminLogoutRequest,
} from "@/lib/site-admin-logout-navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateNoStoreHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  let body: string;
  try {
    body = await request.text();
  } catch {
    return Response.json(
      { result: "LOGOUT_REQUEST_INVALID" },
      { status: 400, headers: privateNoStoreHeaders },
    );
  }

  const rejection = validateSiteAdminLogoutRequest(request.url, request.headers, body);
  if (rejection) {
    return Response.json(
      { result: rejection },
      { status: rejection === "LOGOUT_CROSS_SITE_REJECTED" ? 403 : 400, headers: privateNoStoreHeaders },
    );
  }

  return createSiteAdminLogoutRedirect(request.url, process.env.NODE_ENV === "production");
}
