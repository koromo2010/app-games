import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  createSiteAdminLogoutRedirect,
  siteAdminLogoutPath,
  siteAdminLogoutReconciliationPath,
  validateSiteAdminLogoutRequest,
} from "../lib/site-admin-logout-navigation.ts";

const origin = "https://dev.game-fields.com";

test("visible logout is one native empty POST and the old fetch/DELETE path is retired", () => {
  const panel = readFileSync("app/admin/SiteAdminPanel.tsx", "utf8");
  const settingsRoute = readFileSync("app/api/admin/site-settings/route.ts", "utf8");

  assert.match(panel, /<form method="post" action=\{siteAdminLogoutPath\}>/);
  assert.match(panel, /<button type="submit"[^>]*>ログアウト<\/button>/);
  assert.doesNotMatch(panel, /logoutSiteAdmin|isLoggingOut|logoutInFlight|method:\s*"DELETE"/);
  assert.doesNotMatch(settingsRoute, /export async function DELETE/);
  assert.equal(existsSync("lib/site-admin-logout-client.ts"), false);
});

test("logout POST accepts only the fixed query-free same-origin empty request", async () => {
  assert.equal(validateSiteAdminLogoutRequest(`${origin}${siteAdminLogoutPath}`, new Headers({ origin }), ""), null);
  assert.equal(validateSiteAdminLogoutRequest(`${origin}${siteAdminLogoutPath}?next=/admin`, new Headers({ origin }), ""), "LOGOUT_QUERY_NOT_ALLOWED");
  assert.equal(validateSiteAdminLogoutRequest(`${origin}${siteAdminLogoutPath}`, new Headers({ origin: "https://evil.example" }), ""), "LOGOUT_CROSS_SITE_REJECTED");
  assert.equal(validateSiteAdminLogoutRequest(`${origin}${siteAdminLogoutPath}`, new Headers({ origin, "sec-fetch-site": "cross-site" }), ""), "LOGOUT_CROSS_SITE_REJECTED");
  assert.equal(validateSiteAdminLogoutRequest(`${origin}${siteAdminLogoutPath}`, new Headers({ origin }), "next=/admin"), "LOGOUT_BODY_NOT_ALLOWED");

  const route = readFileSync("app/api/admin/site-admin-logout/route.ts", "utf8");
  assert.match(route, /export async function POST\(request: Request\)/);
  assert.match(route, /await request\.text\(\)/);
  assert.match(route, /validateSiteAdminLogoutRequest\(request\.url, request\.headers, body\)/);
  assert.doesNotMatch(route, /export async function (GET|PUT|PATCH|DELETE)/);
});

test("accepted logout returns one 303 carrying both exact host-only cookie expirations", async () => {
  const response = createSiteAdminLogoutRedirect(`${origin}${siteAdminLogoutPath}`, true);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${origin}${siteAdminLogoutReconciliationPath}`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-game-fields-logout-result"), "LOGOUT_RECONCILIATION_PENDING");

  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.match(cookies[0]!, /^game-fields-site-admin=;/);
  assert.match(cookies[1]!, /^game-fields-site-admin-challenge=;/);
  for (const cookie of cookies) {
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=strict/i);
    assert.match(cookie, /Secure/);
    assert.doesNotMatch(cookie, /Domain=/i);
  }
});

test("reconciliation is a later server request with fail-closed machine results", () => {
  const page = readFileSync("app/site-admin/logout-reconciliation/page.tsx", "utf8");
  const panel = readFileSync("app/admin/SiteAdminPanel.tsx", "utf8");

  assert.match(page, /await getSiteAdminSession\(\)/);
  assert.match(page, /session \? "SESSION_STILL_AUTHENTICATED" : "LOGOUT_COMPLETE"/);
  assert.match(page, /LOGOUT_RECONCILIATION_FAILED/);
  assert.match(page, /自動再試行は行いません/);
  assert.match(page, /data-site-admin-logout-result=\{result\}/);
  assert.match(panel, /initialLogoutResult === "LOGOUT_COMPLETE" \? "login" : "checking"/);
  assert.match(panel, /initialLogoutResult === "SESSION_STILL_AUTHENTICATED"/);
  assert.match(panel, /サーバー上の管理者セッションが残っているため、ログアウトを完了できませんでした/);
  assert.doesNotMatch(page, /redirect\(|router\.|location\.|fetch\(/);
});

test("logout route cannot invoke migration 011 and migration implementation is untouched by this flow", () => {
  const route = readFileSync("app/api/admin/site-admin-logout/route.ts", "utf8");
  const panel = readFileSync("app/admin/SiteAdminPanel.tsx", "utf8");
  assert.doesNotMatch(route, /migration-011|sdkMigration011|fetch\(/);
  assert.doesNotMatch(panel.match(/<form method="post" action=\{siteAdminLogoutPath\}>[\s\S]*?<\/form>/)?.[0] ?? "", /migration-011/);
});
