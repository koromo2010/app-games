import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { logoutSiteAdmin } from "../lib/site-admin-logout-client.ts";

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

test("logout requires exact DELETE success followed by one unauthenticated reconciliation", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push([input, init]);
    return calls.length === 1
      ? json({ ok: true })
      : json({ error: "ADMIN_AUTH_REQUIRED" }, 401);
  };

  assert.deepEqual(await logoutSiteAdmin(fetcher), { ok: true });
  assert.deepEqual(calls, [
    ["/api/admin/site-settings", { method: "DELETE" }],
    ["/api/admin/site-settings", { method: "GET", cache: "no-store" }],
  ]);
});

test("logout never reconciles after a rejected or malformed DELETE", async () => {
  for (const response of [json({ error: "SITE_ADMIN_LOGOUT_FAILED" }, 500), json({ ok: true, extra: true })]) {
    let calls = 0;
    const result = await logoutSiteAdmin((async () => {
      calls += 1;
      return response;
    }) as typeof fetch);
    assert.equal(result.ok, false);
    assert.equal(calls, 1);
  }
});

test("logout fails closed when the server session remains authenticated", async () => {
  let calls = 0;
  const result = await logoutSiteAdmin((async () => {
    calls += 1;
    return calls === 1
      ? json({ ok: true })
      : json({ settings: {}, session: {} });
  }) as typeof fetch);
  assert.deepEqual(result, { ok: false, code: "SESSION_STILL_AUTHENTICATED" });
  assert.equal(calls, 2);
});

test("logout does not retry ambiguous transport or reconciliation results", async () => {
  let deleteTransportCalls = 0;
  assert.deepEqual(await logoutSiteAdmin((async () => {
    deleteTransportCalls += 1;
    throw new Error("offline");
  }) as typeof fetch), { ok: false, code: "TRANSPORT_FAILED" });
  assert.equal(deleteTransportCalls, 1);

  let reconciliationCalls = 0;
  assert.deepEqual(await logoutSiteAdmin((async () => {
    reconciliationCalls += 1;
    return reconciliationCalls === 1
      ? json({ ok: true })
      : json({ error: "OTHER" }, 401);
  }) as typeof fetch), { ok: false, code: "RECONCILIATION_FAILED" });
  assert.equal(reconciliationCalls, 2);
});

test("server and UI preserve the strict logout truth boundary", () => {
  const auth = readFileSync("lib/site-admin-auth.ts", "utf8");
  const route = readFileSync("app/api/admin/site-settings/route.ts", "utf8");
  const panel = readFileSync("app/admin/SiteAdminPanel.tsx", "utf8");

  assert.match(auth, /siteAdminCookieName/);
  assert.match(auth, /siteAdminChallengeCookieName/);
  assert.match(auth, /expires:\s*new Date\(0\)/);
  assert.match(route, /SITE_ADMIN_LOGOUT_FAILED/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.match(panel, /if \(result\.ok\) \{\s*setSession\(null\);\s*setScreen\("login"\)/);
  assert.match(panel, /SESSION_STILL_AUTHENTICATED/);
  assert.match(panel, /logoutInFlight\.current/);
  assert.doesNotMatch(panel, /logoutSiteAdmin\(\)[\s\S]*logoutSiteAdmin\(/);
});
