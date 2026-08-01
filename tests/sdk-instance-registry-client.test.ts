import assert from "node:assert/strict";
import test from "node:test";
import {
  probeSdkInstanceRegistry,
  sdkInstanceRegistryCommand,
} from "../apps/sdk-portal/lib/instance-registry-client.ts";

test("SDK instance registry probe fails closed when credentials are missing", async () => {
  await assert.rejects(
    () => probeSdkInstanceRegistry({
      env: {
        NODE_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "main",
      },
    }),
    /SDK_INSTANCE_REGISTRY_NOT_CONFIGURED/,
  );
});

test("SDK instance registry probe checks the production namespace without writing", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const result = await probeSdkInstanceRegistry({
    env: {
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      SDK_REDIS_REST_URL: "https://redis.example/",
      SDK_REDIS_REST_TOKEN: "secret-token",
    },
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return Response.json({ result: "PONG" });
    },
  });

  assert.deepEqual(result, { status: "ok", namespace: "production" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://redis.example");
  assert.equal(requests[0].init?.method, "POST");
  assert.equal(requests[0].init?.body, JSON.stringify(["PING"]));
  assert.equal(
    new Headers(requests[0].init?.headers).get("authorization"),
    "Bearer secret-token",
  );
});

test("SDK instance registry accepts the Vercel Upstash credential pair", async () => {
  const result = await probeSdkInstanceRegistry({
    env: {
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      UPSTASH_REDIS_REST_URL: "https://redis.example",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token",
    },
    fetch: async (_input, init) => {
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer upstash-token",
      );
      return Response.json({ result: "PONG" });
    },
  });

  assert.deepEqual(result, { status: "ok", namespace: "production" });
});

test("SDK instance registry never combines credentials from different variable families", async () => {
  await assert.rejects(
    () => probeSdkInstanceRegistry({
      env: {
        NODE_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "main",
        SDK_REDIS_REST_URL: "https://redis.example",
        UPSTASH_REDIS_REST_TOKEN: "unpaired-token",
      },
    }),
    /SDK_INSTANCE_REGISTRY_NOT_CONFIGURED/,
  );
});

test("SDK instance registry normalizes network and malformed-response failures", async () => {
  const env = {
    NODE_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    SDK_REDIS_REST_URL: "https://redis.example",
    SDK_REDIS_REST_TOKEN: "secret-token",
  };
  await assert.rejects(
    () => probeSdkInstanceRegistry({
      env,
      fetch: async () => { throw new TypeError("secret network detail"); },
    }),
    /SDK_INSTANCE_REGISTRY_UNAVAILABLE/,
  );
  await assert.rejects(
    () => sdkInstanceRegistryCommand(["GET", "key"], {
      env,
      fetch: async () => Response.json({ unexpected: true }),
    }),
    /SDK_INSTANCE_REGISTRY_UNAVAILABLE/,
  );
});

test("SDK instance registry probe rejects an unexpected Redis response", async () => {
  await assert.rejects(
    () => probeSdkInstanceRegistry({
      env: {
        NODE_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "develop",
        SDK_REDIS_REST_URL: "https://redis.example",
        SDK_REDIS_REST_TOKEN: "secret-token",
      },
      fetch: async () => Response.json({ result: null }),
    }),
    /SDK_INSTANCE_REGISTRY_UNAVAILABLE/,
  );
});
