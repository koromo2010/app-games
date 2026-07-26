import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveSdkInstanceRegistryNamespace,
  sdkInstanceRegistryKey,
  sdkInstanceRegistryReadKeys,
} from "../apps/sdk-portal/lib/instance-registry-namespace.ts";

test("SDK instance reservations are separated between main and develop", () => {
  assert.equal(
    sdkInstanceRegistryKey("same-slug", {
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
    }),
    "sdk:production:preview-instance:v1:same-slug",
  );
  assert.equal(
    sdkInstanceRegistryKey("same-slug", {
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "develop",
    }),
    "sdk:development:preview-instance:v1:same-slug",
  );
});

test("SDK instance registry fails closed on an unexpected production branch", () => {
  assert.throws(
    () => resolveSdkInstanceRegistryNamespace({
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "feature/sdk-change",
    }),
    /SDK_REDIS_NAMESPACE_UNRESOLVED/,
  );
});

test("local development uses the development namespace", () => {
  assert.equal(
    resolveSdkInstanceRegistryNamespace({
      NODE_ENV: "development",
      VERCEL_GIT_COMMIT_REF: undefined,
    }),
    "development",
  );
});

test("development reads legacy reservations during the seven-day transition", () => {
  assert.deepEqual(
    sdkInstanceRegistryReadKeys("reserved-slug", {
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "develop",
    }),
    [
      "sdk:development:preview-instance:v1:reserved-slug",
      "sdk:preview-instance:v1:reserved-slug",
    ],
  );
  assert.deepEqual(
    sdkInstanceRegistryReadKeys("reserved-slug", {
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
    }),
    ["sdk:production:preview-instance:v1:reserved-slug"],
  );
});
