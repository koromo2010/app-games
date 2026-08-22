import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createSdkDatabaseBindingDiagnostic,
  emitSdkDatabaseBindingDiagnostic,
  resolveSdkDatabaseBinding,
  sdkDatabaseBindingOperatorDiagnosticEnabled,
  shouldEmitSdkDatabaseBindingDiagnostic,
} from "../apps/sdk-portal/lib/sdk-database-binding-diagnostic.ts";
import {
  consoleObservabilitySink,
  getObservabilitySink,
  setObservabilitySink,
} from "../lib/observability/sink.ts";

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
  const events: unknown[] = [];
  const previousSink = getObservabilitySink();
  setObservabilitySink({ emit: (event) => { events.push(event); } });
  try {
    const input = {
      binding: resolveSdkDatabaseBinding({ POSTGRES_PRISMA_URL: syntheticDatabaseUrl() }),
      observedSchemaVersion: 9,
      requiredSchemaVersion: 10,
    } as const;
    emitSdkDatabaseBindingDiagnostic(input);
    assert.equal(events.length, 1);
    for (const event of events) {
      const serialized = JSON.stringify(event);
      for (const fragment of forbiddenFragments) assert.equal(serialized.includes(fragment), false);
    }
    emitSdkDatabaseBindingDiagnostic(input);
    assert.equal(events.length, 2);
    for (const event of events) {
      const serialized = JSON.stringify(event);
      for (const fragment of forbiddenFragments) assert.equal(serialized.includes(fragment), false);
    }
  } finally {
    setObservabilitySink(previousSink ?? consoleObservabilitySink);
  }
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
