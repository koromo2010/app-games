import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isSupportRequestId,
  normalizeSupportRequestId,
} from "../lib/support-request-contract.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const validRequestId = "11111111-1111-4111-8111-111111111111";

test("support request IDs are normalized to stable lowercase UUIDs", () => {
  assert.equal(
    normalizeSupportRequestId(`  ${validRequestId.toUpperCase()}  `),
    validRequestId,
  );
  assert.equal(normalizeSupportRequestId("not-a-uuid"), null);
  assert.equal(normalizeSupportRequestId(""), null);
  assert.equal(isSupportRequestId(validRequestId), true);
  assert.equal(isSupportRequestId("request-1"), false);
});

test("invalid draft request IDs are rejected as input, not Redis unavailability", () => {
  const route = read("app/api/internal/sdk-support/route.ts");
  assert.match(route, /normalizeSupportRequestId\(body\?\.requestId\)/);
  assert.match(route, /SUPPORT_REQUEST_ID_INVALID/);
  assert.match(route, /support_draft_invalid/);
  assert.match(route, /status: 400/);
  assert.match(route, /errorCode = observabilityErrorCode\(error\)/);
  assert.match(route, /error: "support_draft_unavailable", errorCode/);
});

test("invalid draft IDs fail before any storage side effect", () => {
  const store = read("lib/user-report-draft-store.ts");
  assert.match(store, /const requestId = normalizeSupportRequestId\(input\.requestId\)/);
  assert.match(store, /if \(!requestId\) \{[\s\S]*USER_REPORT_DRAFT_REQUEST_ID_INVALID/);
  assert.ok(
    store.indexOf("if (!requestId)") < store.indexOf("const inserted = await redisCommand"),
  );
});

test("Portal preserves support service classification and status", () => {
  const api = read("apps/sdk-portal/lib/support-api.ts");
  const route = read("apps/sdk-portal/app/api/support/drafts/[draftId]/route.ts");
  assert.match(api, /class CreatorSupportServiceError/);
  assert.match(api, /response\.status/);
  assert.match(api, /data\?\.errorCode/);
  assert.match(route, /instanceof CreatorSupportServiceError/);
  assert.match(route, /status: error\.status/);
});

test("MCP enforces the same UUID contract before creating a draft", () => {
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  assert.match(mcp, /normalizeSupportRequestId\(args\.requestId\)/);
  assert.match(mcp, /SUPPORT_REQUEST_ID_INVALID/);
});
