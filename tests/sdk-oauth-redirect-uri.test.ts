import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedOAuthRedirectUri } from "../apps/sdk-portal/lib/oauth-redirect-uri.ts";

test("OAuth redirect policy supports Claude Code loopback callbacks", () => {
  assert.equal(isAllowedOAuthRedirectUri("http://localhost:49152/callback"), true);
  assert.equal(isAllowedOAuthRedirectUri("http://127.0.0.1:65535/callback"), true);
  assert.equal(isAllowedOAuthRedirectUri("http://[::1]:43123/callback"), true);
  assert.equal(isAllowedOAuthRedirectUri("https://authoring.example.com/oauth/callback"), true);
});

test("OAuth redirect policy rejects non-loopback HTTP and ambiguous callbacks", () => {
  assert.equal(isAllowedOAuthRedirectUri("http://example.com/callback"), false);
  assert.equal(isAllowedOAuthRedirectUri("http://localhost:43123/not-callback"), false);
  assert.equal(isAllowedOAuthRedirectUri("http://localhost:43123/callback?next=x"), false);
  assert.equal(isAllowedOAuthRedirectUri("https://user@example.com/callback"), false);
  assert.equal(isAllowedOAuthRedirectUri("not a URL"), false);
});
