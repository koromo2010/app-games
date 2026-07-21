import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAppDatabaseEnvironment,
  assertBlobEnvironment,
  assertRedisEnvironment,
  assertRuntimeEnvironmentAgreement,
  expectedAppEnvironment,
} from "../lib/storage-environment-guard.ts";

function withEnvironment(values: Record<string, string | undefined>, run: () => void) {
  const originals = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("mainとdevelopはVercelのDeployment種別より優先してアプリ環境へ対応付ける", () => {
  assert.equal(expectedAppEnvironment("production", "production", "main"), "production");
  assert.equal(expectedAppEnvironment("production", "production", "develop"), "development");
  assert.equal(expectedAppEnvironment("preview", "production", "main"), "production");
});

test("Gitブランチが不明ならVercel環境へフォールバックする", () => {
  assert.equal(expectedAppEnvironment("production", "production", undefined), "production");
  assert.equal(expectedAppEnvironment("preview", "production", undefined), "development");
});

test("PreviewでAPP_ENV=productionなら停止する", () => {
  withEnvironment({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: undefined, APP_ENV: "production" }, () => {
    assert.throws(() => assertRuntimeEnvironmentAgreement(), /APP_ENV_VERCEL_ENV_MISMATCH/);
  });
});

test("developのProduction Deploymentを開発環境として許可する", () => {
  withEnvironment({
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "develop",
    APP_ENV: "development",
    APP_DATABASE_ENV: "development",
    REDIS_ENV: "development",
    BLOB_ENV: "development",
  }, () => {
    assert.equal(assertRuntimeEnvironmentAgreement(), "development");
    assert.doesNotThrow(() => assertAppDatabaseEnvironment("APP_DATABASE_URL"));
    assert.doesNotThrow(() => assertRedisEnvironment());
    assert.doesNotThrow(() => assertBlobEnvironment());
  });
});

test("developでAPP_ENV=productionなら停止する", () => {
  withEnvironment({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "develop", APP_ENV: "production" }, () => {
    assert.throws(() => assertRuntimeEnvironmentAgreement(), /APP_ENV_VERCEL_ENV_MISMATCH/);
  });
});

test("Productionから開発アプリDBへの接続を停止する", () => {
  withEnvironment({
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    APP_ENV: "production",
    APP_DATABASE_ENV: "development",
  }, () => {
    assert.throws(() => assertAppDatabaseEnvironment("APP_DATABASE_URL"), /APP_DATABASE_ENV_MISMATCH/);
  });
});

test("Previewから本番Blobへの接続を停止する", () => {
  withEnvironment({
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: undefined,
    APP_ENV: "development",
    BLOB_ENV: "production",
  }, () => {
    assert.throws(() => assertBlobEnvironment(), /BLOB_ENV_MISMATCH/);
  });
});

test("旧DATABASE_URLは移行期間中だけ環境マーカーなしで利用できる", () => {
  withEnvironment({
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    APP_ENV: undefined,
    APP_DATABASE_ENV: undefined,
  }, () => {
    assert.doesNotThrow(() => assertAppDatabaseEnvironment("DATABASE_URL"));
  });
});
