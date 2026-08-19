import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  requireSdkServiceRequest,
  sdkServiceHeaders,
} from "../lib/sdk-service-auth.ts";

const secret = "test-sdk-support-environment-secret-32-bytes";

function withSecret(run: () => void) {
  const previous = process.env.SDK_ACCOUNT_LINK_SECRET;
  process.env.SDK_ACCOUNT_LINK_SECRET = secret;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.SDK_ACCOUNT_LINK_SECRET;
    else process.env.SDK_ACCOUNT_LINK_SECRET = previous;
  }
}

test("support service headers fail closed when app and signed environments differ", () => {
  withSecret(() => {
    const url = "https://dev.game-fields.com/api/internal/sdk-support?playerId=test";
    const headers = sdkServiceHeaders("GET", url, {
      environment: "development",
    });
    const request = new Request(url, { headers });
    assert.doesNotThrow(() => requireSdkServiceRequest(request, {
      expectedEnvironment: "development",
    }));
    assert.throws(
      () => requireSdkServiceRequest(request, {
        expectedEnvironment: "production",
      }),
      /SDK_SERVICE_ENVIRONMENT_MISMATCH/,
    );
  });
});

test("SDK support route rejects environment mismatch before body and rate-limit writes", () => {
  const route = readFileSync(
    "app/api/internal/sdk-support/route.ts",
    "utf8",
  );
  const post = route.slice(route.indexOf("export async function POST"));
  assert.match(route, /support_environment_mismatch/);
  assert.match(route, /expectedEnvironment: sdkSupportEnvironment\(\)/);
  assert.ok(post.indexOf("authorize(request)") < post.indexOf("request.json()"));
  assert.ok(post.indexOf("authorize(request)") < post.indexOf("rateLimitResponseFor"));
  const portal = readFileSync("apps/sdk-portal/lib/support-api.ts", "utf8");
  assert.match(portal, /resolveSdkInstanceRegistryNamespace/);
  assert.match(portal, /sdkServiceHeaders\(method, url, \{ environment \}\)/);
});
