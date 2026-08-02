import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAccountLinkReturnPath } from "../apps/sdk-portal/lib/account-link-return.ts";

test("account-link return paths remain same-origin relative paths", () => {
  assert.equal(
    normalizeAccountLinkReturnPath("/krm/games/corners?revision=abc#ignored"),
    "/krm/games/corners?revision=abc",
  );
  assert.equal(normalizeAccountLinkReturnPath("/"), "/");
  assert.equal(normalizeAccountLinkReturnPath("https://evil.example/"), "/");
  assert.equal(normalizeAccountLinkReturnPath("//evil.example/"), "/");
  assert.equal(normalizeAccountLinkReturnPath("/\\\\evil.example/"), "/");
  assert.equal(normalizeAccountLinkReturnPath("javascript:alert(1)"), "/");
  assert.equal(normalizeAccountLinkReturnPath(undefined), "/");
});
