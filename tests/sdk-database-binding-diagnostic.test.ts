import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createSdkDatabaseBindingDiagnostic,
  createSdkDatabaseBindingDiagnosticLogEvent,
  emitSdkDatabaseBindingDiagnostic,
  resolveSdkDatabaseBinding,
  sdkDatabaseBindingOperatorDiagnosticEnabled,
  shouldEmitSdkDatabaseBindingDiagnostic,
} from "../apps/sdk-portal/lib/sdk-database-binding-diagnostic.ts";
import { sdkRuntimeSqlContext } from "../apps/sdk-portal/lib/sdk-postgres.ts";

function syntheticDatabaseUrl() {
  return [
    "postgres:",
    "//",
    "diagnostic-user",
    ":",
    "diagnostic-secret",
    "@",
    "diagnostic-host",
    ".invalid",
    ":5432/",
    "diagnostic-db",
    "?",
    "diagnostic-query",
    "=1",
  ].join("");
}

const forbiddenFragments = [
  "diagnostic-user",
  "diagnostic-secret",
  "diagnostic-host",
  "diagnostic-db",
  "diagnostic-query",
  "postgres:",
];

test("SDK DB selector prioritizes the canonical key and exposes each fallback without its value", () => {
  assert.deepEqual(resolveSdkDatabaseBinding({
    SDK_DATABASE_URL: "first",
    POSTGRES_PRISMA_URL: "second",
    DATABASE_URL: "third",
  }), {
    selectedKey: "SDK_DATABASE_URL",
    fallbackUsed: false,
    databaseUrl: "first",
  });
  assert.equal(resolveSdkDatabaseBinding({ POSTGRES_PRISMA_URL: "second" }).selectedKey, "POSTGRES_PRISMA_URL");
  assert.equal(resolveSdkDatabaseBinding({ POSTGRES_PRISMA_URL: "second" }).fallbackUsed, true);
  assert.equal(resolveSdkDatabaseBinding({ DATABASE_URL: "third" }).selectedKey, "DATABASE_URL");
  assert.deepEqual(resolveSdkDatabaseBinding({}), { selectedKey: "NONE", fallbackUsed: false });
});

test("SDK DB diagnostic fingerprints are deterministic and discard credentials, query data, and target text", () => {
  const binding = resolveSdkDatabaseBinding({ SDK_DATABASE_URL: syntheticDatabaseUrl() });
  const first = createSdkDatabaseBindingDiagnostic({
    binding,
    observedSchemaVersion: 9,
    requiredSchemaVersion: 10,
  });
  const second = createSdkDatabaseBindingDiagnostic({
    binding,
    observedSchemaVersion: 9,
    requiredSchemaVersion: 10,
  });
  assert.deepEqual(first, second);
  assert.equal(first.databaseSelectorKey, "SDK_DATABASE_URL");
  assert.equal(first.databaseFallbackUsed, false);
  assert.match(first.databaseTargetFingerprint ?? "", /^[a-f0-9]{64}$/);
  assert.match(first.databaseNameFingerprint ?? "", /^[a-f0-9]{64}$/);
  const serialized = JSON.stringify(first);
  for (const fragment of forbiddenFragments) assert.equal(serialized.includes(fragment), false);
});

test("SDK DB selector fails closed for NONE without a target fingerprint", () => {
  const diagnostic = createSdkDatabaseBindingDiagnostic({
    binding: resolveSdkDatabaseBinding({}),
    observedSchemaVersion: 0,
    requiredSchemaVersion: 10,
  });
  assert.deepEqual(diagnostic, {
    databaseSelectorKey: "NONE",
    databaseFallbackUsed: false,
    observedSchemaVersion: 0,
    requiredSchemaVersion: 10,
  });
});

test("SDK runtime SQL context reduces its selected URL to fingerprints without exposing the URL", () => {
  const keys = ["SDK_DATABASE_URL", "POSTGRES_PRISMA_URL", "DATABASE_URL"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  process.env.POSTGRES_PRISMA_URL = syntheticDatabaseUrl();
  try {
    const context = sdkRuntimeSqlContext();
    const diagnostic = createSdkDatabaseBindingDiagnostic({
      binding: resolveSdkDatabaseBinding({ POSTGRES_PRISMA_URL: syntheticDatabaseUrl() }),
      observedSchemaVersion: 10,
      requiredSchemaVersion: 11,
    });
    assert.equal(context.selectedKey, "POSTGRES_PRISMA_URL");
    assert.equal(context.fallbackUsed, true);
    assert.equal(context.databaseTargetFingerprint, diagnostic.databaseTargetFingerprint);
    assert.equal(context.databaseNameFingerprint, diagnostic.databaseNameFingerprint);
    assert.equal("databaseUrl" in context, false);
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("schema 10 suppresses default diagnostic output, while mismatch or explicit operator mode permits one", () => {
  assert.equal(shouldEmitSdkDatabaseBindingDiagnostic({
    observedSchemaVersion: 10,
    requiredSchemaVersion: 10,
  }), false);
  assert.equal(shouldEmitSdkDatabaseBindingDiagnostic({
    observedSchemaVersion: 9,
    requiredSchemaVersion: 10,
  }), true);
  assert.equal(shouldEmitSdkDatabaseBindingDiagnostic({
    observedSchemaVersion: 10,
    requiredSchemaVersion: 10,
    operatorDiagnostic: true,
  }), true);
  assert.equal(sdkDatabaseBindingOperatorDiagnosticEnabled({ SDK_DATABASE_BINDING_DIAGNOSTIC: "1" }), true);
  assert.equal(sdkDatabaseBindingOperatorDiagnosticEnabled({ SDK_DATABASE_BINDING_DIAGNOSTIC: "true" }), false);
});

test("one mismatch attempt emits one safe structured runtime event; replay keeps source values absent", () => {
  const input = {
    binding: resolveSdkDatabaseBinding({ POSTGRES_PRISMA_URL: syntheticDatabaseUrl() }),
    observedSchemaVersion: 9,
    requiredSchemaVersion: 10,
  } as const;
  const event = createSdkDatabaseBindingDiagnosticLogEvent(input, {
    VERCEL_GIT_COMMIT_REF: "develop",
    VERCEL_GIT_COMMIT_SHA: "1234567890abcdef",
    VERCEL_REGION: "hnd1",
  });
  assert.deepEqual(event, {
    schemaVersion: 1,
    occurredAt: event.occurredAt,
    level: "info",
    event: "sdk.database-binding-diagnostic",
    service: "game-fields-sdk-portal",
    environment: "development",
    deployment: "1234567890ab",
    region: "hnd1",
    fields: createSdkDatabaseBindingDiagnostic(input),
  });
  const serializedEvent = JSON.stringify(event);
  for (const fragment of forbiddenFragments) assert.equal(serializedEvent.includes(fragment), false);

  const lines: string[] = [];
  const previousInfo = console.info;
  console.info = (value?: unknown) => { lines.push(String(value)); };
  try {
    emitSdkDatabaseBindingDiagnostic(input);
    emitSdkDatabaseBindingDiagnostic(input);
    assert.equal(lines.length, 2);
    for (const line of lines) {
      const serialized = JSON.stringify(JSON.parse(line));
      for (const fragment of forbiddenFragments) assert.equal(serialized.includes(fragment), false);
    }
  } finally {
    console.info = previousInfo;
  }
});

test("SDK DB diagnostic remains within the isolated Portal dependency boundary", () => {
  const source = readFileSync("apps/sdk-portal/lib/sdk-database-binding-diagnostic.ts", "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:observability|redis)[^"']*["']/);
  assert.doesNotMatch(source, /require\(["'][^"']*(?:observability|redis)[^"']*["']\)/);
});

test("health remains response-compatible and delegates selection to the shared SDK PostgreSQL path", () => {
  const health = readFileSync("apps/sdk-portal/app/api/health/route.ts", "utf8");
  const postgres = readFileSync("apps/sdk-portal/lib/sdk-postgres.ts", "utf8");
  assert.match(health, /await ensureSdkSchema\(\)/);
  assert.match(health, /SDK_SCHEMA_MIGRATION_REQUIRED/);
  assert.doesNotMatch(health, /databaseTargetFingerprint|databaseSelectorKey|SDK_DATABASE_BINDING_DIAGNOSTIC/);
  assert.match(postgres, /resolveSdkDatabaseBinding\(\)/);
  assert.match(postgres, /sdkSqlForBinding\(requestedBinding\)/);
  assert.doesNotMatch(postgres, /process\.env\.(SDK_DATABASE_URL|POSTGRES_PRISMA_URL|DATABASE_URL)/);
});
