import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createSdkServiceAuthorization,
  createSdkServiceOperationAuthorization,
  verifySdkServiceOperationAuthorization,
  type SdkServiceOperationGrant,
} from "../packages/sdk-service-auth/src/index.ts";
import {
  assertSdkMigration011Ledger,
  assertSdkMigration011Objects,
  completeSdkMigration011ObjectContract,
  emptySdkMigration011ObjectContract,
  executeSdkMigration011ExactlyOnce,
  sdkMigration011Checksum,
  sdkMigration011GuardedSql,
  sdkMigration011Name,
  sdkMigration011ObjectContractSql,
  sdkMigration011Source,
  SdkMigration011OperatorError,
  SdkMigration011OperationGrantReplayGuard,
  type SdkMigration011Database,
  type SdkMigrationLedgerRow,
} from "../apps/sdk-portal/lib/sdk-migration-011-operator.ts";
import {
  isAcceptedSdkMigration011DatabaseIdentity,
  isCanonicalDevelopmentSdkPortalRuntime,
  processSdkMigration011OperatorRequest,
  sdkMigration011DevelopmentFallbackIdentity,
  type OperatorDependencies,
} from "../apps/sdk-portal/lib/sdk-migration-011-operator-route.ts";
import { requireSdkMigration011OperationRequest } from "../apps/sdk-portal/lib/sdk-service-auth.ts";
import {
  isCanonicalDevelopmentMigration011Target,
  isCanonicalDevelopmentPlatformRuntime,
  proxySdkMigration011Operator,
  type SdkMigration011ProxyDependencies,
} from "../lib/sdk-migration-011-proxy.ts";
import { migrationChecksum } from "../scripts/migrate-sdk-database.mjs";

const serviceSecret = "s".repeat(32);
const portalPath = "/api/internal/operations/migration-011";
const platformPath = "/api/admin/sdk-migration-011";
const action = "sdk-migration-011";
const operationId = "11111111-1111-4111-8111-111111111111";
const nonce = "22222222-2222-4222-8222-222222222222";
const issuedAt = 1_000_000;
const targetFingerprint = "43a021d13864615b4b73b65847e2e8e41a4de31cd5793fd6ab36c9acf507da0b";
const nameFingerprint = "693fe5919fc229a2cf404ad99e03e8e9277fa4a6d34e88a0d4224d81b0b057a8";

const ledgerThrough010: SdkMigrationLedgerRow[] = [
  { version: 1, name: "001_sdk_registry.sql", checksum: "5456100f4e2bf5cbba4cdf64bc883699ce0a89971e293c08a353803a1e965117" },
  { version: 2, name: "002_sdk_portal_runtime.sql", checksum: "22a80f2062ff27bcadb0be6e940ee6b32a79d171f74865cd043415acb516ce63" },
  { version: 3, name: "003_immutable_packages_and_lifecycle.sql", checksum: "60c88555bb042c28f5196d7c916ac222fb2ab37ef4294e64b32e5d4ddd2507c5" },
  { version: 4, name: "004_app_release_history.sql", checksum: "51fd28e7b1d2452fe96ba850d1dd7089201031230cdf710733085949099a4571" },
  { version: 5, name: "005_release_decisions.sql", checksum: "242ec4c6fa3004dc8c91605960b5cfe1f0241108d00d114e9cc2f4f494363d34" },
  { version: 6, name: "006_cross_environment_package_artifacts.sql", checksum: "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7" },
  { version: 7, name: "007_reconcile_release_decisions.sql", checksum: "242ec4c6fa3004dc8c91605960b5cfe1f0241108d00d114e9cc2f4f494363d34" },
  { version: 8, name: "008_mock_approval_and_authoring_gate.sql", checksum: "e8b31e6debda55d6a70977a5d9c96aa97403983821d52b1ebcd8d1b32b608894" },
  { version: 9, name: "009_module_profile_proposals.sql", checksum: "b7f306bf3d236118d38719722647984119cdb18aec8614cf042fde757f67c723" },
  { version: 10, name: "010_bounded_creator_quarantine_recovery.sql", checksum: "f0ca21664864b5827819873ab4de29b75c9710097bf4a18cf15b069edca71f0c" },
];

function canonicalLedger(through = 11): SdkMigrationLedgerRow[] {
  return through === 10
    ? ledgerThrough010.map((row) => ({ ...row }))
    : [
      ...ledgerThrough010.map((row) => ({ ...row })),
      { version: 11, name: sdkMigration011Name, checksum: sdkMigration011Checksum },
    ];
}

function operationGrant(
  overrides: Partial<SdkServiceOperationGrant> = {},
): SdkServiceOperationGrant {
  return {
    version: 1,
    kind: "sdk-service-operation",
    method: "POST",
    path: portalPath,
    environment: "development",
    action,
    operationId,
    nonce,
    issuedAt,
    expiresAt: issuedAt + 30_000,
    ...overrides,
  };
}

function operatorDependencies(
  overrides: Partial<OperatorDependencies> = {},
): OperatorDependencies {
  return {
    runtimeIdentity: () => ({
      vercelEnvironment: "production",
      project: "app-games-sdk-dev",
      ref: "develop",
    }),
    authorize: () => operationGrant(),
    consumeGrant: () => undefined,
    runtimeContext: () => ({
      sql: null as never,
      selectedKey: "SDK_DATABASE_URL",
      fallbackUsed: false,
      databaseTargetFingerprint: targetFingerprint,
      databaseNameFingerprint: nameFingerprint,
    }),
    execute: async () => ({
      status: "APPLIED",
      schemaVersion: 11,
      migrationVersion: 11,
      writesPerformed: 1,
    }),
    ...overrides,
  };
}

function proxyDependencies(
  overrides: Partial<SdkMigration011ProxyDependencies> = {},
): SdkMigration011ProxyDependencies {
  return {
    requireRecentMfa: async () => undefined,
    authorizationError: () => null,
    runtimeIdentity: () => ({
      semanticEnvironment: "development",
      vercelEnvironment: "production",
      project: "app-games-dev",
      ref: "develop",
    }),
    targetUrl: () => `https://sdk-dev.game-fields.com${portalPath}`,
    operationIdentity: () => ({ operationId, nonce }),
    operationHeaders: () => ({ "X-Test-Grant": "opaque" }),
    fetchTarget: (async () => Response.json({
      status: "APPLIED",
      phase: "T-131-A4-v008",
      operation: "SDK_MIGRATION_011",
      operationId,
      environment: "development",
      databaseSelectorKey: "SDK_DATABASE_URL",
      databaseFallbackUsed: false,
      databaseTargetFingerprint: targetFingerprint,
      databaseNameFingerprint: nameFingerprint,
      migrationVersion: 11,
      observedSchemaVersion: 11,
      writesPerformed: 1,
      secretFree: true,
    })) as typeof fetch,
    ...overrides,
  };
}

async function responseJson(response: Response) {
  return await response.json() as Record<string, unknown>;
}

test("Development operation grant fixes method, path, environment, action, UUIDs, expiry, and signature", () => {
  const authorization = createSdkServiceOperationAuthorization({
    method: "POST",
    path: portalPath,
    environment: "development",
    action,
    operationId,
    nonce,
    now: issuedAt,
  }, serviceSecret);
  assert.deepEqual(verifySdkServiceOperationAuthorization(authorization, {
    method: "POST",
    path: portalPath,
    environment: "development",
    action,
    now: issuedAt + 29_999,
  }, serviceSecret), operationGrant());
  for (const expected of [
    { method: "GET", path: portalPath, environment: "development" as const, action },
    { method: "POST", path: "/api/internal/operations/migration-010", environment: "development" as const, action },
    { method: "POST", path: portalPath, environment: "production" as const, action },
    { method: "POST", path: portalPath, environment: "development" as const, action: "sdk-migration-010" },
  ]) {
    assert.equal(verifySdkServiceOperationAuthorization(
      authorization,
      { ...expected, now: issuedAt },
      serviceSecret,
    ), null);
  }
});

test("Portal authorization requires both service HMAC and the exact Development operation grant", () => {
  const previous = process.env.SDK_ACCOUNT_LINK_SECRET;
  process.env.SDK_ACCOUNT_LINK_SECRET = serviceSecret;
  try {
    const now = Date.now();
    const service = createSdkServiceAuthorization({
      method: "POST",
      path: portalPath,
      environment: "development",
      now,
    }, serviceSecret);
    const operation = createSdkServiceOperationAuthorization({
      method: "POST",
      path: portalPath,
      environment: "development",
      action,
      operationId,
      nonce,
      now,
    }, serviceSecret);
    const request = new Request(`https://sdk-dev.game-fields.com${portalPath}`, {
      method: "POST",
      headers: {
        "X-Game-Fields-SDK-Service": service,
        "X-Game-Fields-SDK-Environment": "development",
        "X-Game-Fields-SDK-Operation": operation,
      },
    });
    const grant = requireSdkMigration011OperationRequest(request, { now: now + 1 });
    assert.equal(grant.environment, "development");
    assert.equal(grant.action, action);
    assert.equal(grant.operationId, operationId);
    assert.equal(grant.nonce, nonce);
    assert.throws(() => requireSdkMigration011OperationRequest(
      new Request(`https://sdk-dev.game-fields.com${portalPath}`, {
        method: "POST",
        headers: {
          "X-Game-Fields-SDK-Service": service,
          "X-Game-Fields-SDK-Environment": "production",
          "X-Game-Fields-SDK-Operation": operation,
        },
      }),
      { now: now + 1 },
    ));
  } finally {
    if (previous === undefined) delete process.env.SDK_ACCOUNT_LINK_SECRET;
    else process.env.SDK_ACCOUNT_LINK_SECRET = previous;
  }
});

test("Platform proxy requires recent MFA and maps the authorization response before dispatch", async () => {
  let fetched = false;
  const response = await proxySdkMigration011Operator(
    new Request(`https://dev.game-fields.com${platformPath}`, { method: "POST" }),
    proxyDependencies({
      requireRecentMfa: async () => {
        throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
      },
      authorizationError: () => Response.json({ error: "ADMIN_STEP_UP_REQUIRED" }, { status: 403 }),
      fetchTarget: (async () => {
        fetched = true;
        return new Response();
      }) as typeof fetch,
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(fetched, false);
  assert.deepEqual(await responseJson(response), { error: "ADMIN_STEP_UP_REQUIRED" });
});

test("Platform and Portal runtime identities require exact Development projects and develop ref", () => {
  assert.equal(isCanonicalDevelopmentPlatformRuntime({
    semanticEnvironment: "development",
    vercelEnvironment: "production",
    project: "app-games-dev",
    ref: "develop",
  }), true);
  assert.equal(isCanonicalDevelopmentSdkPortalRuntime({
    vercelEnvironment: "production",
    project: "app-games-sdk-dev",
    ref: "develop",
  }), true);
  for (const identity of [
    { semanticEnvironment: "production", vercelEnvironment: "production", project: "app-games", ref: "main" },
    { semanticEnvironment: "development", vercelEnvironment: "preview", project: "app-games-dev", ref: "develop" },
    { semanticEnvironment: "development", vercelEnvironment: "production", project: "app-games-preview-dev", ref: "develop" },
    { semanticEnvironment: "development", vercelEnvironment: "production", project: "app-games-dev", ref: undefined },
  ]) {
    assert.equal(isCanonicalDevelopmentPlatformRuntime(identity), false);
  }
  for (const identity of [
    { vercelEnvironment: "production", project: "app-games-sdk", ref: "main" },
    { vercelEnvironment: "preview", project: "app-games-sdk-dev", ref: "develop" },
    { vercelEnvironment: "production", project: "app-games-preview-dev", ref: "develop" },
    { vercelEnvironment: "production", project: "app-games-sdk-dev", ref: undefined },
  ]) {
    assert.equal(isCanonicalDevelopmentSdkPortalRuntime(identity), false);
  }
});

test("Platform accepts only the canonical SDK Development operator URL and no query/body", async () => {
  assert.equal(
    isCanonicalDevelopmentMigration011Target(`https://sdk-dev.game-fields.com${portalPath}`),
    true,
  );
  for (const target of [
    `https://sdk.game-fields.com${portalPath}`,
    `https://preview-dev.game-fields.com${portalPath}`,
    `https://sdk-dev.game-fields.com${portalPath}?target=x`,
    `https://user@sdk-dev.game-fields.com${portalPath}`,
  ]) assert.equal(isCanonicalDevelopmentMigration011Target(target), false);

  let fetched = 0;
  for (const request of [
    new Request(`https://dev.game-fields.com${platformPath}?target=x`, { method: "POST" }),
    new Request(`https://dev.game-fields.com${platformPath}`, { method: "POST", body: "{}" }),
  ]) {
    const response = await proxySdkMigration011Operator(request, proxyDependencies({
      fetchTarget: (async () => {
        fetched += 1;
        return new Response();
      }) as typeof fetch,
    }));
    assert.equal(response.status, 400);
  }
  const wrongTarget = await proxySdkMigration011Operator(
    new Request(`https://dev.game-fields.com${platformPath}`, { method: "POST" }),
    proxyDependencies({ targetUrl: () => `https://sdk.game-fields.com${portalPath}` }),
  );
  assert.equal(wrongTarget.status, 403);
  assert.equal(fetched, 0);
});

test("Production, Preview, and ambiguous Portal identities reject before authorization or database resolution", async () => {
  for (const runtimeIdentity of [
    { vercelEnvironment: "production", project: "app-games-sdk", ref: "main" },
    { vercelEnvironment: "preview", project: "app-games-sdk-dev", ref: "develop" },
    { vercelEnvironment: undefined, project: undefined, ref: undefined },
  ]) {
    let authorized = false;
    let resolved = false;
    const response = await processSdkMigration011OperatorRequest(
      new Request(`https://sdk.example${portalPath}`, { method: "POST" }),
      operatorDependencies({
        runtimeIdentity: () => runtimeIdentity,
        authorize: () => {
          authorized = true;
          return operationGrant();
        },
        runtimeContext: () => {
          resolved = true;
          return {
            sql: null as never,
            selectedKey: "SDK_DATABASE_URL",
            fallbackUsed: false,
            databaseTargetFingerprint: targetFingerprint,
            databaseNameFingerprint: nameFingerprint,
          };
        },
      }),
    );
    assert.equal(response.status, 403);
    assert.equal(authorized, false);
    assert.equal(resolved, false);
  }
});

test("Portal rejects query/body and invalid grant, then enforces replay protection", async () => {
  for (const request of [
    new Request(`https://sdk.example${portalPath}?target=x`, { method: "POST" }),
    new Request(`https://sdk.example${portalPath}`, { method: "POST", body: "{}" }),
  ]) {
    const response = await processSdkMigration011OperatorRequest(request, operatorDependencies());
    assert.equal(response.status, 400);
  }
  const invalidGrant = await processSdkMigration011OperatorRequest(
    new Request(`https://sdk.example${portalPath}`, { method: "POST" }),
    operatorDependencies({ authorize: () => { throw new Error("invalid"); } }),
  );
  assert.equal(invalidGrant.status, 403);

  const guard = new SdkMigration011OperationGrantReplayGuard();
  const dependencies = operatorDependencies({
    consumeGrant: (grant) => guard.consume(grant, issuedAt + 1),
  });
  const first = await processSdkMigration011OperatorRequest(
    new Request(`https://sdk.example${portalPath}`, { method: "POST" }),
    dependencies,
  );
  const replay = await processSdkMigration011OperatorRequest(
    new Request(`https://sdk.example${portalPath}`, { method: "POST" }),
    dependencies,
  );
  assert.equal(first.status, 200);
  assert.equal(replay.status, 409);
  assert.equal((await responseJson(replay)).code, "SDK_OPERATION_GRANT_REPLAY");
});

test("Portal accepts canonical binding and the exact Development fingerprint-locked fallback", async () => {
  assert.equal(isAcceptedSdkMigration011DatabaseIdentity({
    sql: null as never,
    selectedKey: "SDK_DATABASE_URL",
    fallbackUsed: false,
    databaseTargetFingerprint: "1".repeat(64),
    databaseNameFingerprint: "2".repeat(64),
  }), true);
  assert.deepEqual(sdkMigration011DevelopmentFallbackIdentity, {
    selectedKey: "POSTGRES_PRISMA_URL",
    fallbackUsed: true,
    databaseTargetFingerprint: targetFingerprint,
    databaseNameFingerprint: nameFingerprint,
  });
  const response = await processSdkMigration011OperatorRequest(
    new Request(`https://sdk.example${portalPath}`, { method: "POST" }),
    operatorDependencies({
      runtimeContext: () => ({
        sql: null as never,
        ...sdkMigration011DevelopmentFallbackIdentity,
      }),
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), {
    schemaVersion: 1,
    task: "T-131-A4",
    phase: "T-131-A4-v008",
    status: "APPLIED",
    operation: "SDK_MIGRATION_011",
    operationId,
    environment: "development",
    databaseSelectorKey: "POSTGRES_PRISMA_URL",
    databaseFallbackUsed: true,
    databaseTargetFingerprint: targetFingerprint,
    databaseNameFingerprint: nameFingerprint,
    migrationVersion: 11,
    observedSchemaVersion: 11,
    writesPerformed: 1,
    secretFree: true,
  });
});

test("Portal rejects every selector or fingerprint mismatch before execute", async () => {
  const cases = [
    { selectedKey: "DATABASE_URL" as const, fallbackUsed: true, databaseTargetFingerprint: targetFingerprint, databaseNameFingerprint: nameFingerprint, code: "SDK_DATABASE_SELECTOR_NOT_EXACT" },
    { selectedKey: "NONE" as const, fallbackUsed: false, databaseTargetFingerprint: targetFingerprint, databaseNameFingerprint: nameFingerprint, code: "SDK_DATABASE_SELECTOR_NOT_EXACT" },
    { selectedKey: "SDK_DATABASE_URL" as const, fallbackUsed: true, databaseTargetFingerprint: targetFingerprint, databaseNameFingerprint: nameFingerprint, code: "SDK_DATABASE_SELECTOR_NOT_EXACT" },
    { selectedKey: "POSTGRES_PRISMA_URL" as const, fallbackUsed: false, databaseTargetFingerprint: targetFingerprint, databaseNameFingerprint: nameFingerprint, code: "SDK_DATABASE_SELECTOR_NOT_EXACT" },
    { selectedKey: "POSTGRES_PRISMA_URL" as const, fallbackUsed: true, databaseTargetFingerprint: "0".repeat(64), databaseNameFingerprint: nameFingerprint, code: "SDK_DATABASE_FINGERPRINT_MISMATCH" },
    { selectedKey: "POSTGRES_PRISMA_URL" as const, fallbackUsed: true, databaseTargetFingerprint: targetFingerprint, databaseNameFingerprint: "0".repeat(64), code: "SDK_DATABASE_FINGERPRINT_MISMATCH" },
    { selectedKey: "POSTGRES_PRISMA_URL" as const, fallbackUsed: true, databaseTargetFingerprint: undefined, databaseNameFingerprint: nameFingerprint, code: "SDK_DATABASE_FINGERPRINT_MISMATCH" },
    { selectedKey: "SDK_DATABASE_URL" as const, fallbackUsed: false, databaseTargetFingerprint: "invalid", databaseNameFingerprint: nameFingerprint, code: "SDK_DATABASE_FINGERPRINT_MISMATCH" },
  ];
  for (const context of cases) {
    let executed = false;
    const response = await processSdkMigration011OperatorRequest(
      new Request(`https://sdk.example${portalPath}`, { method: "POST" }),
      operatorDependencies({
        runtimeContext: () => ({ sql: null as never, ...context }),
        execute: async () => {
          executed = true;
          return { status: "APPLIED", schemaVersion: 11, migrationVersion: 11, writesPerformed: 1 };
        },
      }),
    );
    assert.equal(response.status, 409);
    assert.equal((await responseJson(response)).code, context.code);
    assert.equal(executed, false);
  }
});

test("ledger accepts canonical and legacy 005 lineage and rejects missing, duplicate, mismatch, and ahead rows", () => {
  assert.doesNotThrow(() => assertSdkMigration011Ledger(canonicalLedger(10), "before"));
  assert.doesNotThrow(() => assertSdkMigration011Ledger(canonicalLedger(11), "after"));
  const legacy005 = canonicalLedger(10).map((row) => row.version === 5 ? {
    version: 5,
    name: "005_cross_environment_package_artifacts.sql",
    checksum: "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7",
  } : row);
  assert.doesNotThrow(() => assertSdkMigration011Ledger(legacy005, "before"));
  for (const rows of [
    canonicalLedger(10).filter((row) => row.version !== 4),
    [...canonicalLedger(10), { ...canonicalLedger(10)[9] }],
    canonicalLedger(10).map((row) => row.version === 8 ? { ...row, checksum: "0".repeat(64) } : row),
  ]) {
    assert.throws(
      () => assertSdkMigration011Ledger(rows, "before"),
      (error: unknown) => error instanceof SdkMigration011OperatorError
        && error.code === "SDK_MIGRATION_LEDGER_INCONSISTENT",
    );
  }
  assert.throws(
    () => assertSdkMigration011Ledger([
      ...canonicalLedger(11),
      { version: 12, name: "012_unknown.sql", checksum: "0".repeat(64) },
    ], "after"),
    (error: unknown) => error instanceof SdkMigration011OperatorError
      && error.code === "SDK_MIGRATION_LEDGER_AHEAD",
  );
});

test("object contract rejects partial state and accepts only complete schema 11 closure", () => {
  assert.doesNotThrow(() => assertSdkMigration011Objects(
    emptySdkMigration011ObjectContract,
    "before",
  ));
  assert.doesNotThrow(() => assertSdkMigration011Objects(
    completeSdkMigration011ObjectContract,
    "after",
  ));
  for (const contract of [
    { ...emptySdkMigration011ObjectContract, presentObjectCount: 1 },
    { ...completeSdkMigration011ObjectContract, columnsExact: false },
    { ...completeSdkMigration011ObjectContract, constraintsExact: false },
    { ...completeSdkMigration011ObjectContract, functionExact: false },
  ]) {
    assert.throws(
      () => assertSdkMigration011Objects(
        contract,
        contract.presentObjectCount === 1 ? "before" : "after",
      ),
      (error: unknown) => error instanceof SdkMigration011OperatorError
        && error.code === "SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH",
    );
  }
});

test("one-time apply reaches exact schema 11 and already-applied match performs zero writes", async () => {
  let ledger = canonicalLedger(10);
  let objects = { ...emptySdkMigration011ObjectContract };
  let applyCount = 0;
  const database: SdkMigration011Database = {
    readLedger: async () => ledger.map((row) => ({ ...row })),
    readSchemaVersion: async () => ledger.at(-1)?.version ?? 0,
    readObjectContract: async () => ({ ...objects }),
    applyGuardedMigration: async () => {
      applyCount += 1;
      ledger = canonicalLedger(11);
      objects = { ...completeSdkMigration011ObjectContract };
    },
  };
  assert.deepEqual(await executeSdkMigration011ExactlyOnce(database), {
    status: "APPLIED",
    schemaVersion: 11,
    migrationVersion: 11,
    writesPerformed: 1,
  });
  assert.equal(applyCount, 1);
  assert.deepEqual(await executeSdkMigration011ExactlyOnce(database), {
    status: "ALREADY_APPLIED_MATCH",
    schemaVersion: 11,
    migrationVersion: 11,
    writesPerformed: 0,
  });
  assert.equal(applyCount, 1);
});

test("transaction and post-commit failures never produce accepted application", async () => {
  const transactionFailure: SdkMigration011Database = {
    readLedger: async () => canonicalLedger(10),
    readSchemaVersion: async () => 10,
    readObjectContract: async () => ({ ...emptySdkMigration011ObjectContract }),
    applyGuardedMigration: async () => { throw new Error("rollback"); },
  };
  await assert.rejects(
    () => executeSdkMigration011ExactlyOnce(transactionFailure),
    (error: unknown) => error instanceof SdkMigration011OperatorError
      && error.code === "SDK_MIGRATION_011_TRANSACTION_FAILED",
  );

  let ledgerReads = 0;
  const readbackFailure: SdkMigration011Database = {
    readLedger: async () => (++ledgerReads === 1 ? canonicalLedger(10) : canonicalLedger(11)),
    readSchemaVersion: async () => 10,
    readObjectContract: async () => ledgerReads === 1
      ? { ...emptySdkMigration011ObjectContract }
      : { ...completeSdkMigration011ObjectContract },
    applyGuardedMigration: async () => undefined,
  };
  await assert.rejects(
    () => executeSdkMigration011ExactlyOnce(readbackFailure),
    (error: unknown) => error instanceof SdkMigration011OperatorError
      && error.code === "SDK_MIGRATION_011_POST_COMMIT_READBACK_FAILED",
  );
});

test("operator source is byte-equivalent to migration 011 and binds the canonical checksum and guarded lock", () => {
  const canonicalSource = readFileSync(
    "db/sdk/011_development_private_workspace_import.sql",
    "utf8",
  ).replace(/\r\n?/g, "\n");
  assert.equal(sdkMigration011Source, canonicalSource);
  assert.equal(migrationChecksum(sdkMigration011Source), sdkMigration011Checksum);
  assert.match(sdkMigration011GuardedSql, /game-fields-sdk-migration-011-development-v1/);
  assert.match(sdkMigration011GuardedSql, /SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH/);
  assert.match(sdkMigration011GuardedSql, /INSERT INTO sdk_schema_migrations/);
  assert.match(sdkMigration011ObjectContractSql, /presentObjectCount/);
  assert.match(sdkMigration011ObjectContractSql, /COUNT\(\*\) = 40/);
  assert.doesNotMatch(
    sdkMigration011Source,
    /INSERT\s+INTO\s+(?:sdk_development_private_workspace|sdk_creators|sdk_games|sdk_app_releases|sdk_oauth_grants)/i,
  );
  assert.doesNotMatch(
    sdkMigration011GuardedSql,
    /UPDATE\s+sdk_schema_migrations|DELETE\s+FROM|ON\s+CONFLICT/i,
  );
});

test("proxy accepts only APPLIED or exact ALREADY_APPLIED_MATCH receipts", async () => {
  const already = await proxySdkMigration011Operator(
    new Request(`https://dev.game-fields.com${platformPath}`, { method: "POST" }),
    proxyDependencies({
      fetchTarget: (async () => Response.json({
        status: "ALREADY_APPLIED_MATCH",
        phase: "T-131-A4-v008",
        operation: "SDK_MIGRATION_011",
        operationId,
        environment: "development",
        databaseSelectorKey: "SDK_DATABASE_URL",
        databaseFallbackUsed: false,
        databaseTargetFingerprint: targetFingerprint,
        databaseNameFingerprint: nameFingerprint,
        migrationVersion: 11,
        observedSchemaVersion: 11,
        writesPerformed: 0,
        secretFree: true,
      })) as typeof fetch,
    }),
  );
  assert.equal(already.status, 200);
  assert.equal((await responseJson(already)).status, "ALREADY_APPLIED_MATCH");

  const fallback = await proxySdkMigration011Operator(
    new Request(`https://dev.game-fields.com${platformPath}`, { method: "POST" }),
    proxyDependencies({
      fetchTarget: (async () => Response.json({
        status: "APPLIED",
        phase: "T-131-A4-v008",
        operation: "SDK_MIGRATION_011",
        operationId,
        environment: "development",
        databaseSelectorKey: "POSTGRES_PRISMA_URL",
        databaseFallbackUsed: true,
        databaseTargetFingerprint: targetFingerprint,
        databaseNameFingerprint: nameFingerprint,
        migrationVersion: 11,
        observedSchemaVersion: 11,
        writesPerformed: 1,
        secretFree: true,
      })) as typeof fetch,
    }),
  );
  assert.equal(fallback.status, 200);
  assert.equal((await responseJson(fallback)).databaseSelectorKey, "POSTGRES_PRISMA_URL");

  for (const payload of [
    { status: "APPLIED", operationId: "different" },
    { status: "ALREADY_APPLIED_MATCH", operationId, writesPerformed: 1 },
    {
      status: "APPLIED",
      phase: "T-131-A4-v008",
      operation: "SDK_MIGRATION_011",
      operationId,
      environment: "development",
      databaseSelectorKey: "POSTGRES_PRISMA_URL",
      databaseFallbackUsed: true,
      databaseTargetFingerprint: "0".repeat(64),
      databaseNameFingerprint: nameFingerprint,
      migrationVersion: 11,
      observedSchemaVersion: 11,
      writesPerformed: 1,
      secretFree: true,
    },
    {
      status: "APPLIED",
      phase: "T-131-A4-v008",
      operation: "SDK_MIGRATION_011",
      operationId,
      environment: "development",
      databaseSelectorKey: "POSTGRES_PRISMA_URL",
      databaseFallbackUsed: true,
      databaseTargetFingerprint: targetFingerprint,
      databaseNameFingerprint: "0".repeat(64),
      migrationVersion: 11,
      observedSchemaVersion: 11,
      writesPerformed: 1,
      secretFree: true,
    },
    {
      status: "APPLIED",
      phase: "T-131-A4-v008",
      operation: "SDK_MIGRATION_011",
      operationId,
      environment: "development",
      databaseSelectorKey: "DATABASE_URL",
      databaseFallbackUsed: true,
      databaseTargetFingerprint: targetFingerprint,
      databaseNameFingerprint: nameFingerprint,
      migrationVersion: 11,
      observedSchemaVersion: 11,
      writesPerformed: 1,
      secretFree: true,
    },
  ]) {
    const invalid = await proxySdkMigration011Operator(
      new Request(`https://dev.game-fields.com${platformPath}`, { method: "POST" }),
      proxyDependencies({ fetchTarget: (async () => Response.json(payload)) as typeof fetch }),
    );
    assert.equal(invalid.status, 502);
  }
});

test("both routes are POST-only and expose no database, SQL, migration, target, or operation input", () => {
  const platformRoute = readFileSync("app/api/admin/sdk-migration-011/route.ts", "utf8");
  const portalRoute = readFileSync(
    "apps/sdk-portal/app/api/internal/operations/migration-011/route.ts",
    "utf8",
  );
  const proxy = readFileSync("lib/sdk-migration-011-proxy.ts", "utf8");
  const operatorRoute = readFileSync(
    "apps/sdk-portal/lib/sdk-migration-011-operator-route.ts",
    "utf8",
  );
  assert.match(platformRoute, /requireRecentSiteAdminMfa/);
  assert.match(platformRoute, /sdkMigration011OperationHeaders/);
  assert.match(platformRoute, /randomUUID/);
  assert.match(platformRoute, /export async function POST/);
  assert.match(portalRoute, /export async function POST/);
  assert.doesNotMatch(platformRoute + portalRoute, /export async function (GET|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(
    platformRoute + portalRoute + proxy,
    /SDK_DATABASE_URL\s*=|databaseUrl|migrationName|migrationVersion\s*:.*request|targetSlug|targetKey|planReceipt/,
  );
  assert.match(operatorRoute, /selectedKey === "SDK_DATABASE_URL"/);
  assert.match(operatorRoute, /SDK_DATABASE_FINGERPRINT_MISMATCH/);
  assert.match(operatorRoute, /POSTGRES_PRISMA_URL/);
  assert.doesNotMatch(operatorRoute, /process\.env\.SDK_DATABASE_URL/);
  assert.doesNotMatch(operatorRoute + proxy, /process\.env\..*FINGERPRINT/);
});
