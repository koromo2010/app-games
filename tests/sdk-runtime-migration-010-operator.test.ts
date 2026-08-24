import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createSdkServiceOperationAuthorization,
  verifySdkServiceOperationAuthorization,
  type SdkServiceOperationGrant,
} from "../packages/sdk-service-auth/src/index.ts";
import {
  assertSdkMigration010Ledger,
  executeSdkMigration010ExactlyOnce,
  sdkMigration010Checksum,
  sdkMigration010GuardedSql,
  sdkMigration010Name,
  sdkMigration010Source,
  SdkMigration010OperatorError,
  SdkOperationGrantReplayGuard,
  type SdkMigration010Database,
  type SdkMigrationLedgerRow,
} from "../apps/sdk-portal/lib/sdk-migration-010-operator.ts";
import {
  processSdkMigration010OperatorRequest,
  type OperatorDependencies,
} from "../apps/sdk-portal/lib/sdk-migration-010-operator-route.ts";
import {
  proxySdkMigration010Operator,
  type SdkMigration010ProxyDependencies,
} from "../lib/sdk-migration-010-proxy.ts";
import { migrationChecksum } from "../scripts/migrate-sdk-database.mjs";

const serviceSecret = "s".repeat(32);
const operatorPath = "/api/internal/operations/migration-010";
const action = "sdk-migration-010";
const operationId = "11111111-1111-4111-8111-111111111111";
const nonce = "22222222-2222-4222-8222-222222222222";
const issuedAt = 1_000_000;

const ledgerThrough009: SdkMigrationLedgerRow[] = [
  { version: 1, name: "001_sdk_registry.sql", checksum: "5456100f4e2bf5cbba4cdf64bc883699ce0a89971e293c08a353803a1e965117" },
  { version: 2, name: "002_sdk_portal_runtime.sql", checksum: "22a80f2062ff27bcadb0be6e940ee6b32a79d171f74865cd043415acb516ce63" },
  { version: 3, name: "003_immutable_packages_and_lifecycle.sql", checksum: "60c88555bb042c28f5196d7c916ac222fb2ab37ef4294e64b32e5d4ddd2507c5" },
  { version: 4, name: "004_app_release_history.sql", checksum: "51fd28e7b1d2452fe96ba850d1dd7089201031230cdf710733085949099a4571" },
  { version: 5, name: "005_release_decisions.sql", checksum: "242ec4c6fa3004dc8c91605960b5cfe1f0241108d00d114e9cc2f4f494363d34" },
  { version: 6, name: "006_cross_environment_package_artifacts.sql", checksum: "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7" },
  { version: 7, name: "007_reconcile_release_decisions.sql", checksum: "242ec4c6fa3004dc8c91605960b5cfe1f0241108d00d114e9cc2f4f494363d34" },
  { version: 8, name: "008_mock_approval_and_authoring_gate.sql", checksum: "e8b31e6debda55d6a70977a5d9c96aa97403983821d52b1ebcd8d1b32b608894" },
  { version: 9, name: "009_module_profile_proposals.sql", checksum: "b7f306bf3d236118d38719722647984119cdb18aec8614cf042fde757f67c723" },
];

function canonicalLedger(through = 10): SdkMigrationLedgerRow[] {
  return through === 9
    ? ledgerThrough009.map((row) => ({ ...row }))
    : [
      ...ledgerThrough009.map((row) => ({ ...row })),
      { version: 10, name: sdkMigration010Name, checksum: sdkMigration010Checksum },
    ];
}

function operationGrant(
  overrides: Partial<SdkServiceOperationGrant> = {},
): SdkServiceOperationGrant {
  return {
    version: 1,
    kind: "sdk-service-operation",
    method: "POST",
    path: operatorPath,
    environment: "production",
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
    environment: () => "production",
    authorize: () => operationGrant(),
    consumeGrant: () => undefined,
    runtimeContext: () => ({
      sql: null as never,
      selectedKey: "SDK_DATABASE_URL",
      fallbackUsed: false,
    }),
    execute: async () => ({ schemaVersion: 10, migrationVersion: 10 }),
    ...overrides,
  };
}

function proxyDependencies(
  overrides: Partial<SdkMigration010ProxyDependencies> = {},
): SdkMigration010ProxyDependencies {
  return {
    requireRecentMfa: async () => undefined,
    authorizationError: () => null,
    environment: () => "production",
    targetUrl: () => `https://sdk.example${operatorPath}`,
    operationIdentity: () => ({ operationId, nonce }),
    operationHeaders: () => ({ "X-Test-Grant": "opaque" }),
    fetchTarget: (async () => Response.json({
      status: "APPLIED",
      phase: "T-131-A1",
      operation: "SDK_MIGRATION_010",
      operationId,
      databaseSelectorKey: "SDK_DATABASE_URL",
      databaseFallbackUsed: false,
      migrationVersion: 10,
      observedSchemaVersion: 10,
      secretFree: true,
    })) as typeof fetch,
    ...overrides,
  };
}

async function responseJson(response: Response) {
  return await response.json() as Record<string, unknown>;
}

test("operation grant fixes signature, expiry, environment, action, operation ID, and nonce", () => {
  const authorization = createSdkServiceOperationAuthorization({
    method: "POST",
    path: operatorPath,
    environment: "production",
    action,
    operationId,
    nonce,
    now: issuedAt,
  }, serviceSecret);
  assert.deepEqual(verifySdkServiceOperationAuthorization(authorization, {
    method: "POST",
    path: operatorPath,
    environment: "production",
    action,
    now: issuedAt + 29_999,
  }, serviceSecret), operationGrant());
  for (const expected of [
    { environment: "development" as const, now: issuedAt },
    { environment: "production" as const, now: issuedAt + 30_000 },
  ]) {
    assert.equal(verifySdkServiceOperationAuthorization(authorization, {
      method: "POST",
      path: operatorPath,
      action,
      ...expected,
    }, serviceSecret), null);
  }
  assert.equal(verifySdkServiceOperationAuthorization(
    `${authorization.slice(0, -1)}x`,
    { method: "POST", path: operatorPath, environment: "production", action, now: issuedAt },
    serviceSecret,
  ), null);
});

test("Site Admin proxy requires recent MFA before contacting SDK Portal", async () => {
  let fetched = false;
  const response = await proxySdkMigration010Operator(
    new Request("https://platform.example/api/admin/sdk-migration-010", { method: "POST" }),
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
});

test("operator rejects wrong runtime, query/body input, and invalid grant", async () => {
  let authorized = false;
  const wrongRuntime = await processSdkMigration010OperatorRequest(
    new Request(`https://sdk.example${operatorPath}`, { method: "POST" }),
    operatorDependencies({
      environment: () => "development",
      authorize: () => {
        authorized = true;
        return operationGrant();
      },
    }),
  );
  assert.equal(wrongRuntime.status, 403);
  assert.equal(authorized, false);
  const query = await processSdkMigration010OperatorRequest(
    new Request(`https://sdk.example${operatorPath}?target=x`, { method: "POST" }),
    operatorDependencies(),
  );
  assert.equal(query.status, 400);
  const body = await processSdkMigration010OperatorRequest(
    new Request(`https://sdk.example${operatorPath}`, { method: "POST", body: "{}" }),
    operatorDependencies(),
  );
  assert.equal(body.status, 400);
  const invalidGrant = await processSdkMigration010OperatorRequest(
    new Request(`https://sdk.example${operatorPath}`, { method: "POST" }),
    operatorDependencies({ authorize: () => { throw new Error("invalid"); } }),
  );
  assert.equal(invalidGrant.status, 403);
});

test("operator rejects fallback selection and consumes a grant once", async () => {
  let executed = false;
  const fallback = await processSdkMigration010OperatorRequest(
    new Request(`https://sdk.example${operatorPath}`, { method: "POST" }),
    operatorDependencies({
      runtimeContext: () => ({
        sql: null as never,
        selectedKey: "POSTGRES_PRISMA_URL",
        fallbackUsed: true,
      }),
      execute: async () => {
        executed = true;
        return { schemaVersion: 10, migrationVersion: 10 };
      },
    }),
  );
  assert.equal(fallback.status, 409);
  assert.equal(executed, false);

  const guard = new SdkOperationGrantReplayGuard();
  const dependencies = operatorDependencies({
    consumeGrant: (grant) => guard.consume(grant, issuedAt + 1),
  });
  const first = await processSdkMigration010OperatorRequest(
    new Request(`https://sdk.example${operatorPath}`, { method: "POST" }),
    dependencies,
  );
  const replay = await processSdkMigration010OperatorRequest(
    new Request(`https://sdk.example${operatorPath}`, { method: "POST" }),
    dependencies,
  );
  assert.equal(first.status, 200);
  assert.equal(replay.status, 409);
  assert.equal((await responseJson(replay)).code, "SDK_OPERATION_GRANT_REPLAY");
});

test("ledger accepts canonical and legacy 005 lineage and rejects gaps, replay, and 011+", () => {
  assert.doesNotThrow(() => assertSdkMigration010Ledger(canonicalLedger(9), "before"));
  const legacy005 = canonicalLedger(9).map((row) => row.version === 5 ? {
    version: 5,
    name: "005_cross_environment_package_artifacts.sql",
    checksum: "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7",
  } : row);
  assert.doesNotThrow(() => assertSdkMigration010Ledger(legacy005, "before"));
  for (const [rows, expected] of [
    [canonicalLedger(10), "SDK_MIGRATION_010_ALREADY_APPLIED"],
    [canonicalLedger(9).filter((row) => row.version !== 4), "SDK_MIGRATION_LEDGER_INCONSISTENT"],
    [[...canonicalLedger(9), { version: 11, name: "011_no.sql", checksum: "0".repeat(64) }], "SDK_MIGRATION_LEDGER_AHEAD"],
  ] as const) {
    assert.throws(
      () => assertSdkMigration010Ledger([...rows], "before"),
      (error: unknown) => error instanceof SdkMigration010OperatorError
        && error.code === expected,
    );
  }
});

test("two concurrent applications serialize to one ledger 010 success", async () => {
  let ledger = canonicalLedger(9);
  let lock = Promise.resolve();
  const database: SdkMigration010Database = {
    readLedger: async () => ledger.map((row) => ({ ...row })),
    readSchemaVersion: async () => ledger.at(-1)?.version ?? 0,
    applyGuardedMigration: async () => {
      const previous = lock;
      let release!: () => void;
      lock = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        if (ledger.some((row) => row.version === 10)) {
          throw new SdkMigration010OperatorError("SDK_MIGRATION_010_ALREADY_APPLIED");
        }
        await Promise.resolve();
        ledger = canonicalLedger(10);
      } finally {
        release();
      }
    },
  };
  const results = await Promise.allSettled([
    executeSdkMigration010ExactlyOnce(database),
    executeSdkMigration010ExactlyOnce(database),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(ledger.filter((row) => row.version === 10).length, 1);
});

test("transaction and ledger failure never produce an accepted application", async () => {
  for (const failure of ["migration-middle", "ledger-write"]) {
    const ledger = canonicalLedger(9);
    const database: SdkMigration010Database = {
      readLedger: async () => ledger,
      readSchemaVersion: async () => 9,
      applyGuardedMigration: async () => { throw new Error(failure); },
    };
    await assert.rejects(
      () => executeSdkMigration010ExactlyOnce(database),
      (error: unknown) => error instanceof SdkMigration010OperatorError
        && error.code === "SDK_MIGRATION_010_TRANSACTION_FAILED",
    );
    assert.equal(ledger.some((row) => row.version === 10), false);
  }
});

test("post-commit ledger or schema mismatch is never accepted", async () => {
  let ledgerReads = 0;
  const ledgerMismatch: SdkMigration010Database = {
    readLedger: async () => {
      ledgerReads += 1;
      return canonicalLedger(9);
    },
    readSchemaVersion: async () => 10,
    applyGuardedMigration: async () => undefined,
  };
  await assert.rejects(
    () => executeSdkMigration010ExactlyOnce(ledgerMismatch),
    (error: unknown) => error instanceof SdkMigration010OperatorError
      && error.code === "SDK_MIGRATION_010_POST_COMMIT_READBACK_FAILED",
  );
  assert.equal(ledgerReads, 2);

  ledgerReads = 0;
  const schemaMismatch: SdkMigration010Database = {
    readLedger: async () => (++ledgerReads === 1 ? canonicalLedger(9) : canonicalLedger(10)),
    readSchemaVersion: async () => 9,
    applyGuardedMigration: async () => undefined,
  };
  await assert.rejects(
    () => executeSdkMigration010ExactlyOnce(schemaMismatch),
    (error: unknown) => error instanceof SdkMigration010OperatorError
      && error.code === "SDK_MIGRATION_010_POST_COMMIT_READBACK_FAILED",
  );
});

test("runtime executor binds the exact target-neutral migration and guarded ledger write", () => {
  const canonicalSource = readFileSync(
    "db/sdk/010_bounded_creator_quarantine_recovery.sql",
    "utf8",
  ).replace(/\r\n?/g, "\n");
  assert.equal(sdkMigration010Source, canonicalSource);
  assert.equal(migrationChecksum(sdkMigration010Source), sdkMigration010Checksum);
  assert.match(sdkMigration010GuardedSql, /pg_advisory_xact_lock/);
  assert.match(sdkMigration010GuardedSql, /SDK_MIGRATION_010_ALREADY_APPLIED/);
  assert.match(sdkMigration010GuardedSql, /INSERT INTO sdk_schema_migrations/);
  assert.doesNotMatch(sdkMigration010GuardedSql, /ON CONFLICT|UPDATE\s+sdk_schema_migrations|DELETE\s+FROM/i);
});

test("proxy accepts only the fixed success receipt", async () => {
  const invalid = await proxySdkMigration010Operator(
    new Request("https://platform.example/api/admin/sdk-migration-010", { method: "POST" }),
    proxyDependencies({
      fetchTarget: (async () => Response.json({
        status: "APPLIED",
        operationId: "different",
      })) as typeof fetch,
    }),
  );
  assert.equal(invalid.status, 502);
  assert.equal((await responseJson(invalid)).code, "SDK_MIGRATION_010_INVALID_RESPONSE");
});

test("both routes are POST-only and expose no database or recovery input", () => {
  const platformRoute = readFileSync("app/api/admin/sdk-migration-010/route.ts", "utf8");
  const portalRoute = readFileSync(
    "apps/sdk-portal/app/api/internal/operations/migration-010/route.ts",
    "utf8",
  );
  const postgres = readFileSync("apps/sdk-portal/lib/sdk-postgres.ts", "utf8");
  assert.match(platformRoute, /requireRecentSiteAdminMfa/);
  assert.match(platformRoute, /sdkMigration010OperationHeaders/);
  assert.match(platformRoute, /export async function POST/);
  assert.doesNotMatch(platformRoute, /export async function (GET|PUT|PATCH|DELETE)/);
  assert.match(portalRoute, /export async function POST/);
  assert.doesNotMatch(portalRoute, /export async function (GET|PUT|PATCH|DELETE)/);
  assert.match(postgres, /sdkRuntimeSqlContext/);
  assert.doesNotMatch(
    platformRoute + portalRoute,
    /SDK_DATABASE_URL\s*=|DATABASE_URL\s*=|migrationNumber|databaseUrl|targetSlug|targetKey/,
  );
});
