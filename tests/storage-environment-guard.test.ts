import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAppDatabaseEnvironment,
  assertBlobEnvironment,
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

test("Vercel ProductionとPreviewをアプリ環境へ対応付ける", () => {
  assert.equal(expectedAppEnvironment("production", "production"), "production");
  assert.equal(expectedAppEnvironment("preview", "production"), "development");
});

test("PreviewでAPP_ENV=productionなら停止する", () => {
  withEnvironment({ VERCEL_ENV: "preview", APP_ENV: "production" }, () => {
    assert.throws(() => assertRuntimeEnvironmentAgreement(), /APP_ENV_VERCEL_ENV_MISMATCH/);
  });
});

test("Productionから開発アプリDBへの接続を停止する", () => {
  withEnvironment({ VERCEL_ENV: "production", APP_ENV: "production", APP_DATABASE_ENV: "development" }, () => {
    assert.throws(() => assertAppDatabaseEnvironment("APP_DATABASE_URL"), /APP_DATABASE_ENV_MISMATCH/);
  });
});

test("Previewから本番Blobへの接続を停止する", () => {
  withEnvironment({ VERCEL_ENV: "preview", APP_ENV: "development", BLOB_ENV: "production" }, () => {
    assert.throws(() => assertBlobEnvironment(), /BLOB_ENV_MISMATCH/);
  });
});

test("旧DATABASE_URLは移行期間中だけ環境マーカーなしで利用できる", () => {
  withEnvironment({ VERCEL_ENV: "production", APP_ENV: undefined, APP_DATABASE_ENV: undefined }, () => {
    assert.doesNotThrow(() => assertAppDatabaseEnvironment("DATABASE_URL"));
  });
});
