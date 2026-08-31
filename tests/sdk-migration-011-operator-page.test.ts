import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSingleUseMigration011Submitter } from "../lib/sdk-migration-011-client.ts";
import { requireSdkMigration011PageAccess } from "../lib/sdk-migration-011-page-access.ts";
import { performSdkMigration011TotpStepUp } from "../lib/sdk-migration-011-step-up-client.ts";

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

test("page access separates full-session step-up from exact Development and authentication failures", async () => {
  let fullSessionChecks = 0;
  assert.equal(await requireSdkMigration011PageAccess({
    runtimeIdentity: () => canonicalRuntime,
    requireFullSession: async () => {
      fullSessionChecks += 1;
      return { recentMfa: true };
    },
  }), "ready");
  assert.equal(await requireSdkMigration011PageAccess({
    runtimeIdentity: () => canonicalRuntime,
    requireFullSession: async () => {
      fullSessionChecks += 1;
      return { recentMfa: false };
    },
  }), "step-up-required");
  assert.equal(fullSessionChecks, 2);

  await assert.rejects(requireSdkMigration011PageAccess({
    runtimeIdentity: () => ({ ...canonicalRuntime, project: "app-games" }),
    requireFullSession: async () => {
      fullSessionChecks += 1;
      return { recentMfa: true };
    },
  }), /DEVELOPMENT_RUNTIME_REQUIRED/);
  assert.equal(fullSessionChecks, 2);

  for (const code of ["SITE_ADMIN_AUTH_REQUIRED", "SITE_ADMIN_FULL_AUTH_REQUIRED"]) {
    await assert.rejects(requireSdkMigration011PageAccess({
      runtimeIdentity: () => canonicalRuntime,
      requireFullSession: async () => { throw new Error(code); },
    }), new RegExp(code));
  }
});

test("operator TOTP step-up uses the bounded auth challenge and never dispatches migration", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const result = await performSdkMigration011TotpStepUp("123456", (async (input, init) => {
    calls.push([input, init]);
    return calls.length === 1
      ? Response.json({ verified: false, totpAvailable: true })
      : Response.json({ verified: true, session: { scope: "full", mfaAt: 123 } });
  }) as typeof fetch);

  assert.deepEqual(result, { kind: "verified" });
  assert.equal(calls.length, 2);
  assert.equal(calls.every(([input]) => input === "/api/admin/passkeys"), true);
  assert.deepEqual(calls.map(([, init]) => JSON.parse(String(init?.body))), [
    { action: "begin-totp-step-up" },
    { action: "verify-totp", totpCode: "123456" },
  ]);
  assert.equal(calls.some(([input]) => String(input).includes("sdk-migration-011")), false);
});

test("operator TOTP step-up is fail-closed for authentication, challenge, response, and transport failures", async () => {
  let calls = 0;
  assert.deepEqual(await performSdkMigration011TotpStepUp("12345", (async () => {
    calls += 1;
    return Response.json({ verified: true });
  }) as typeof fetch), { kind: "failed", code: "INVALID_TOTP_FORMAT" });
  assert.equal(calls, 0);

  for (const code of [
    "ADMIN_AUTH_REQUIRED",
    "ADMIN_FULL_AUTH_REQUIRED",
    "SITE_ADMIN_TOTP_UNAVAILABLE",
  ] as const) {
    assert.deepEqual(await performSdkMigration011TotpStepUp("123456", (async () => (
      Response.json({ error: code }, { status: code === "ADMIN_AUTH_REQUIRED" ? 401 : 403 })
    )) as typeof fetch), { kind: "failed", code });
  }

  let challengeCalls = 0;
  assert.deepEqual(await performSdkMigration011TotpStepUp("123456", (async () => {
    challengeCalls += 1;
    return challengeCalls === 1
      ? Response.json({ verified: false, totpAvailable: true })
      : Response.json({ error: "SITE_ADMIN_CHALLENGE_EXPIRED" }, { status: 400 });
  }) as typeof fetch), { kind: "failed", code: "SITE_ADMIN_CHALLENGE_EXPIRED" });
  assert.equal(challengeCalls, 2);

  assert.deepEqual(await performSdkMigration011TotpStepUp("123456", (async () => (
    Response.json({ verified: true, migration: "unexpected" })
  )) as typeof fetch), { kind: "failed", code: "INVALID_RESPONSE" });
  assert.deepEqual(await performSdkMigration011TotpStepUp("123456", (async () => {
    throw new Error("network result unknown");
  }) as typeof fetch), { kind: "failed", code: "TRANSPORT_FAILED" });
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
  for (const code of [
    "SITE_ADMIN_STEP_UP_REQUIRED",
    "SDK_MIGRATION_011_PREFLIGHT_READ_FAILED",
    "SDK_MIGRATION_011_OPERATOR_FAILED",
    "SDK_MIGRATION_011_UNAVAILABLE",
  ]) {
    const stopped = createSingleUseMigration011Submitter((async () => Response.json({
      schemaVersion: 1,
      task: "T-131-A4",
      phase: "T-131-A4-v008",
      status: "STOPPED",
      code,
      secretFree: true,
    }, { status: code === "SITE_ADMIN_STEP_UP_REQUIRED" ? 403 : 503 })) as typeof fetch);
    assert.deepEqual(await stopped(), { kind: "stopped", code });
  }

  const invalid = createSingleUseMigration011Submitter((async () => Response.json({ secret: "leak" }, { status: 500 })) as typeof fetch);
  assert.deepEqual(await invalid(), { kind: "failed", code: "INVALID_RESPONSE" });
});

test("operator page provides only inline TOTP step-up and preserves body-free migration mutation", () => {
  const page = readFileSync("app/site-admin/runtime-operations/sdk-migration-011/page.tsx", "utf8");
  const panel = readFileSync("app/site-admin/runtime-operations/sdk-migration-011/SdkMigration011OperatorPanel.tsx", "utf8");
  const access = readFileSync("lib/sdk-migration-011-page-access.ts", "utf8");
  const stepUp = readFileSync("lib/sdk-migration-011-step-up-client.ts", "utf8");
  const authRoute = readFileSync("app/api/admin/passkeys/route.ts", "utf8");
  const adminPage = readFileSync("app/admin/page.tsx", "utf8");
  const combined = page + panel + access + stepUp;

  assert.match(page, /requireFullSiteAdminSession/);
  assert.match(page, /isRecentSiteAdminMfa/);
  assert.match(page, /requireSdkMigration011PageAccess/);
  assert.match(page, /SITE_ADMIN_AUTH_REQUIRED[\s\S]*SITE_ADMIN_FULL_AUTH_REQUIRED/);
  assert.match(panel, /initialAccess === "step-up-required"/);
  assert.match(panel, /<form[\s\S]*Authenticatorの6桁コード[\s\S]*pattern="\[0-9\]\{6\}"/);
  assert.match(panel, /router\.refresh\(\)/);
  assert.match(authRoute, /action === "begin-totp-step-up"[\s\S]*requireFullSiteAdminSession\(\)[\s\S]*siteAdminTotpStatus\(session\.email\)[\s\S]*purpose: "step-up"/);
  assert.doesNotMatch(combined, /60\s*\*\s*1000|Date\.now|setTimeout|setInterval/);
  assert.match(panel, /type="password"[\s\S]*autoComplete="one-time-code"/);
  assert.doesNotMatch(panel, /recoveryCode|window\.(?:prompt|confirm)|\bprompt\(|\bconfirm\(/);
  assert.doesNotMatch(combined, /localStorage|sessionStorage|console\.|document\.cookie/);
  assert.doesNotMatch(page, /fetch\(|method:\s*"POST"/);
  assert.doesNotMatch(stepUp, /\/api\/admin\/sdk-migration-011/);
  assert.match(stepUp, /action: "begin-totp-step-up"/);
  assert.match(stepUp, /action: "verify-totp", totpCode/);
  assert.match(adminPage, /isCanonicalDevelopmentPlatformRuntime/);
  assert.match(adminPage, /showDevelopmentMigration011Operator/);
});
