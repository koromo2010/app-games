import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSingleUseMigration011Submitter } from "../lib/sdk-migration-011-client.ts";
import { requireSdkMigration011PageAccess } from "../lib/sdk-migration-011-page-access.ts";

const targetFingerprint = "43a021d13864615b4b73b65847e2e8e41a4de31cd5793fd6ab36c9acf507da0b";
const nameFingerprint = "693fe5919fc229a2cf404ad99e03e8e9277fa4a6d34e88a0d4224d81b0b057a8";
const canonicalRuntime = {
  semanticEnvironment: "development",
  vercelEnvironment: "production",
  project: "app-games-dev",
  ref: "develop",
};

function success(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    task: "T-131-A4",
    phase: "T-131-A4-v008",
    status: "APPLIED",
    operation: "SDK_MIGRATION_011",
    operationId: "12345678-1234-4123-8123-123456789abc",
    environment: "development",
    databaseSelectorKey: "POSTGRES_PRISMA_URL",
    databaseFallbackUsed: true,
    databaseTargetFingerprint: targetFingerprint,
    databaseNameFingerprint: nameFingerprint,
    migrationVersion: 11,
    observedSchemaVersion: 11,
    writesPerformed: 1,
    secretFree: true,
    ...overrides,
  };
}

test("page access requires exact Development runtime and existing recent-MFA contract", async () => {
  let mfaChecks = 0;
  await requireSdkMigration011PageAccess({
    runtimeIdentity: () => canonicalRuntime,
    requireRecentMfa: async () => { mfaChecks += 1; },
  });
  assert.equal(mfaChecks, 1);

  await assert.rejects(requireSdkMigration011PageAccess({
    runtimeIdentity: () => ({ ...canonicalRuntime, project: "app-games" }),
    requireRecentMfa: async () => { mfaChecks += 1; },
  }), /DEVELOPMENT_RUNTIME_REQUIRED/);
  assert.equal(mfaChecks, 1);
});

test("operator sends exact body-free query-free POST once, including concurrent activation", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const submit = createSingleUseMigration011Submitter((async (input, init) => {
    calls.push([input, init]);
    await Promise.resolve();
    return Response.json(success());
  }) as typeof fetch);

  const [first, second] = await Promise.all([submit(), submit()]);
  assert.deepEqual(first, {
    kind: "success", status: "APPLIED", migrationVersion: 11,
    observedSchemaVersion: 11, writesPerformed: 1,
  });
  assert.deepEqual(second, { kind: "blocked", code: "ALREADY_ATTEMPTED" });
  assert.deepEqual(calls, [["/api/admin/sdk-migration-011", { method: "POST" }]]);
});

test("operator accepts only the fixed Development fingerprint tuple", async () => {
  for (const overrides of [
    { databaseSelectorKey: "SDK_DATABASE_URL" },
    { databaseFallbackUsed: false },
    { databaseTargetFingerprint: "0".repeat(64) },
    { databaseNameFingerprint: "0".repeat(64) },
    { extra: true },
  ]) {
    const submit = createSingleUseMigration011Submitter((async () => Response.json(success(overrides))) as typeof fetch);
    assert.deepEqual(await submit(), { kind: "failed", code: "INVALID_RESPONSE" });
  }
});

test("operator projects bounded STOPPED responses and rejects unknown output", async () => {
  const stopped = createSingleUseMigration011Submitter((async () => Response.json({
    schemaVersion: 1,
    task: "T-131-A4",
    phase: "T-131-A4-v008",
    status: "STOPPED",
    code: "SITE_ADMIN_STEP_UP_REQUIRED",
    secretFree: true,
  }, { status: 403 })) as typeof fetch);
  assert.deepEqual(await stopped(), { kind: "stopped", code: "SITE_ADMIN_STEP_UP_REQUIRED" });

  const invalid = createSingleUseMigration011Submitter((async () => Response.json({ secret: "leak" }, { status: 500 })) as typeof fetch);
  assert.deepEqual(await invalid(), { kind: "failed", code: "INVALID_RESPONSE" });
});

test("operator page has no credential input, no client freshness timer, and no GET mutation", () => {
  const page = readFileSync("app/site-admin/runtime-operations/sdk-migration-011/page.tsx", "utf8");
  const panel = readFileSync("app/site-admin/runtime-operations/sdk-migration-011/SdkMigration011OperatorPanel.tsx", "utf8");
  const access = readFileSync("lib/sdk-migration-011-page-access.ts", "utf8");
  const adminPage = readFileSync("app/admin/page.tsx", "utf8");
  const combined = page + panel + access;

  assert.match(page, /requireRecentSiteAdminMfa/);
  assert.match(page, /requireSdkMigration011PageAccess/);
  assert.doesNotMatch(combined, /60\s*\*\s*1000|Date\.now|setTimeout|setInterval/);
  assert.doesNotMatch(panel, /<input|type="password"|totpCode|recoveryCode/);
  assert.doesNotMatch(page, /fetch\(|method:\s*"POST"/);
  assert.match(adminPage, /isCanonicalDevelopmentPlatformRuntime/);
  assert.match(adminPage, /showDevelopmentMigration011Operator/);
});
