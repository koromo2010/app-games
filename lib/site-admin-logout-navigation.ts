export const siteAdminLogoutPath = "/api/admin/site-admin-logout";
export const siteAdminLogoutReconciliationPath = "/site-admin/logout-reconciliation";
export const siteAdminLogoutCookieNames = [
  "game-fields-site-admin",
  "game-fields-site-admin-challenge",
] as const;
export type SiteAdminLogoutResult = "LOGOUT_COMPLETE" | "SESSION_STILL_AUTHENTICATED";

export type SiteAdminLogoutRequestRejection =
  | "LOGOUT_QUERY_NOT_ALLOWED"
  | "LOGOUT_CROSS_SITE_REJECTED"
  | "LOGOUT_BODY_NOT_ALLOWED";

export function validateSiteAdminLogoutRequest(
  requestUrl: string,
  headers: Pick<Headers, "get">,
  body: string,
): SiteAdminLogoutRequestRejection | null {
  const url = new URL(requestUrl);
  if (url.search !== "") return "LOGOUT_QUERY_NOT_ALLOWED";

  const origin = headers.get("origin");
  const fetchSite = headers.get("sec-fetch-site");
  if (origin !== url.origin || (fetchSite !== null && fetchSite !== "same-origin")) {
    return "LOGOUT_CROSS_SITE_REJECTED";
  }

  if (body !== "") return "LOGOUT_BODY_NOT_ALLOWED";
  return null;
}

function expiredHostOnlyCookie(name: string, secure: boolean) {
  return `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

export function createSiteAdminLogoutRedirect(requestUrl: string, secure: boolean) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Location: new URL(siteAdminLogoutReconciliationPath, requestUrl).toString(),
    "X-Game-Fields-Logout-Result": "LOGOUT_RECONCILIATION_PENDING",
  });
  for (const name of siteAdminLogoutCookieNames) {
    headers.append("Set-Cookie", expiredHostOnlyCookie(name, secure));
  }
  return new Response(null, { status: 303, headers });
}
