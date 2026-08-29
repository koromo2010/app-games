import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import {
  createSdkServiceAuthorization,
  createSdkServiceOperationAuthorization,
  type SdkServiceOperationGrant,
} from "../packages/sdk-service-auth/src/index.ts";
import {
  compareSdkMigration011Ledger,
  sdkMigration011AcceptedLegacy005,
  sdkMigration011CanonicalLedger,
  type SdkMigrationLedgerRow,
} from "../apps/sdk-portal/lib/sdk-migration-011-ledger.ts";
import {
  createSdkMigration011DiagnosticDatabase,
  diagnoseSdkMigration011Ledger,
} from "../apps/sdk-portal/lib/sdk-migration-011-diagnostic.ts";
import {
  processSdkMigration011DiagnosticRequest,
  type DiagnosticDependencies,
} from "../apps/sdk-portal/lib/sdk-migration-011-diagnostic-route.ts";
import { requireSdkMigration011DiagnosticRequest } from "../apps/sdk-portal/lib/sdk-service-auth.ts";
import {
  proxySdkMigration011Diagnostic,
  type SdkMigration011DiagnosticProxyDependencies,
} from "../lib/sdk-migration-011-diagnostic-proxy.ts";

const serviceSecret = "d".repeat(32);
const portalPath = "/api/internal/operations/migration-011/diagnostic";
const platformPath = "/api/admin/sdk-migration-011/diagnostic";
const action = "sdk-migration-011-diagnostic";
const targetFingerprint = "43a021d13864615b4b73b65847e2e8e41a4de31cd5793fd6ab36c9acf507da0b";
const nameFingerprint = "693fe5919fc229a2cf404ad99e03e8e9277fa4a6d34e88a0d4224d81b0b057a8";
const canonical = () => sdkMigration011CanonicalLedger.slice(0, 10).map((row) => ({ ...row }));

function grant(): SdkServiceOperationGrant {
  return {
    version: 1,
    kind: "sdk-service-operation",
    method: "GET",
    path: portalPath,
    environment: "development",
    action,
    operationId: "11111111-1111-4111-8111-111111111111",
    nonce: "22222222-2222-4222-8222-222222222222",
    issuedAt: 1_000,
    expiresAt: 31_000,
  };
}

function diagnosticResult(rows: SdkMigrationLedgerRow[] = canonical()) {
  return {
    observedSchemaVersion: Math.max(0, ...rows.map((row) => row.version)),
    ledger: rows,
    comparison: compareSdkMigration011Ledger(rows),
    objectContract: {
      presentObjectCount: 0,
      columnsExact: false,
      indexesExact: false,
      constraintsExact: false,
      functionExact: false,
      state: "ABSENT" as const,
    },
  };
}

function portalDependencies(overrides: Partial<DiagnosticDependencies> = {}): DiagnosticDependencies {
  return {
    runtimeIdentity: () => ({ vercelEnvironment: "production", project: "app-games-sdk-dev", ref: "develop" }),
    authorize: () => grant(),
    runtimeContext: () => ({
      sql: null as never,
      selectedKey: "POSTGRES_PRISMA_URL",
      fallbackUsed: true,
      databaseTargetFingerprint: targetFingerprint,
      databaseNameFingerprint: nameFingerprint,
    }),
    diagnose: async () => diagnosticResult(),
    ...overrides,
  };
}

function validPayload() {
  return {
    schemaVersion: 1,
    task: "T-131-A4",
    phase: "T-131-A4-v011",
    status: "DIAGNOSTIC_COMPLETE",
    operation: "SDK_MIGRATION_011_LEDGER_DIAGNOSTIC",
    environment: "development",
    databaseSelectorKey: "POSTGRES_PRISMA_URL",
    databaseFallbackUsed: true,
    databaseTargetFingerprint: targetFingerprint,
    databaseNameFingerprint: nameFingerprint,
    observedSchemaVersion: 10,
    ledger: canonical(),
    comparison: compareSdkMigration011Ledger(canonical()),
    objectContract: {
      presentObjectCount: 0,
      columnsExact: false,
      indexesExact: false,
      constraintsExact: false,
      functionExact: false,
      state: "ABSENT",
    },
    secretFree: true,
  };
}

function proxyDependencies(
  overrides: Partial<SdkMigration011DiagnosticProxyDependencies> = {},
): SdkMigration011DiagnosticProxyDependencies {
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
    operationIdentity: () => ({ operationId: grant().operationId, nonce: grant().nonce }),
    operationHeaders: () => ({ "X-Test": "opaque" }),
    fetchTarget: (async () => Response.json(validPayload())) as typeof fetch,
    ...overrides,
  };
}

test("canonical comparison classifies missing, unexpected, duplicate, name, checksum, and accepted legacy v5", () => {
  assert.deepEqual(compareSdkMigration011Ledger(canonical()), {
    consistent: true,
    acceptedLegacyVersion5: false,
    missingVersions: [],
    unexpectedVersions: [],
    duplicateVersions: [],
    nameMismatches: [],
    checksumMismatches: [],
  });
  const legacy = canonical();
  legacy[4] = { ...sdkMigration011AcceptedLegacy005 };
  assert.equal(compareSdkMigration011Ledger(legacy).consistent, true);
  assert.equal(compareSdkMigration011Ledger(legacy).acceptedLegacyVersion5, true);
  const changed = canonical();
  changed.splice(1, 1);
  changed.push({ ...changed[0] }, { version: 12, name: "012_unknown.sql", checksum: "a".repeat(64) });
  changed[2] = { ...changed[2], name: "wrong.sql", checksum: "b".repeat(64) };
  const result = compareSdkMigration011Ledger(changed);
  assert.deepEqual(result.missingVersions, [2]);
  assert.deepEqual(result.unexpectedVersions, [12]);
  assert.deepEqual(result.duplicateVersions, [1]);
  assert.deepEqual(result.nameMismatches.map((item) => item.version), [4]);
  assert.deepEqual(result.checksumMismatches.map((item) => item.version), [4]);
  assert.equal(result.consistent, false);
});

test("database diagnostic uses one repeatable-read read-only transaction", async () => {
  let options: unknown;
  type FakeTransactionSql = ((strings: TemplateStringsArray) => unknown) & {
    query: () => unknown;
  };
  const fakeSql = {
    async transaction(callback: (tx: FakeTransactionSql) => unknown[], input: unknown) {
      options = input;
      const tx = ((strings: TemplateStringsArray) => strings[0].includes("ORDER BY")
        ? canonical() : [{ version: 10 }]) as FakeTransactionSql;
      tx.query = () => [{ presentObjectCount: 0 }];
      return await Promise.all(callback(tx));
    },
  } as unknown as NeonQueryFunction<boolean, boolean>;
  const result = await diagnoseSdkMigration011Ledger(createSdkMigration011DiagnosticDatabase(fakeSql));
  assert.deepEqual(options, { isolationLevel: "RepeatableRead", readOnly: true });
  assert.equal(result.comparison.consistent, true);
  assert.equal(result.objectContract.state, "ABSENT");
});

test("Portal diagnostic authorization binds service HMAC and operation grant to GET Development path", () => {
  const previous = process.env.SDK_ACCOUNT_LINK_SECRET;
  process.env.SDK_ACCOUNT_LINK_SECRET = serviceSecret;
  try {
    const now = Date.now();
    const headers = {
      "X-Game-Fields-SDK-Service": createSdkServiceAuthorization({ method: "GET", path: portalPath, environment: "development", now }, serviceSecret),
      "X-Game-Fields-SDK-Environment": "development",
      "X-Game-Fields-SDK-Operation": createSdkServiceOperationAuthorization({
        method: "GET", path: portalPath, environment: "development", action,
        operationId: grant().operationId, nonce: grant().nonce, now,
      }, serviceSecret),
    };
    const result = requireSdkMigration011DiagnosticRequest(
      new Request(`https://sdk-dev.game-fields.com${portalPath}`, { headers }),
      { now: now + 1 },
    );
    assert.equal(result.action, action);
    assert.throws(() => requireSdkMigration011DiagnosticRequest(
      new Request(`https://sdk-dev.game-fields.com${portalPath}?x=1`, { headers }),
      { now: now + 1 },
    ));
  } finally {
    if (previous === undefined) delete process.env.SDK_ACCOUNT_LINK_SECRET;
    else process.env.SDK_ACCOUNT_LINK_SECRET = previous;
  }
});

test("Portal rejects non-GET, query, noncanonical runtime, missing grant, and fingerprint mismatch before reads", async () => {
  const cases: Array<[Request, Partial<DiagnosticDependencies>, number]> = [
    [new Request(`https://sdk.test${portalPath}`, { method: "POST" }), {}, 405],
    [new Request(`https://sdk.test${portalPath}?x=1`), {}, 400],
    [new Request(`https://sdk.test${portalPath}`), { runtimeIdentity: () => ({ vercelEnvironment: "preview", project: "app-games-sdk-dev", ref: "develop" }) }, 403],
    [new Request(`https://sdk.test${portalPath}`), { authorize: () => { throw new Error("no"); } }, 403],
    [new Request(`https://sdk.test${portalPath}`), { runtimeContext: () => ({ sql: null as never, selectedKey: "POSTGRES_PRISMA_URL", fallbackUsed: true, databaseTargetFingerprint: "0".repeat(64), databaseNameFingerprint: nameFingerprint }) }, 409],
  ];
  for (const [request, overrides, status] of cases) {
    let reads = 0;
    const response = await processSdkMigration011DiagnosticRequest(request, portalDependencies({
      ...overrides,
      diagnose: async () => { reads += 1; return diagnosticResult(); },
    }));
    assert.equal(response.status, status);
    assert.equal(reads, 0);
  }
});

test("Portal returns only secret-free diagnostic evidence", async () => {
  const response = await processSdkMigration011DiagnosticRequest(
    new Request(`https://sdk.test${portalPath}`), portalDependencies(),
  );
  assert.equal(response.status, 200);
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(payload.secretFree, true);
  assert.equal(payload.status, "DIAGNOSTIC_COMPLETE");
  assert.equal(JSON.stringify(payload).includes("postgres://"), false);
});

test("Platform requires MFA, exact runtime, no input, exact target, and dispatches GET", async () => {
  let fetched = 0;
  const blocked = await proxySdkMigration011Diagnostic(
    new Request(`https://dev.game-fields.com${platformPath}`),
    proxyDependencies({
      requireRecentMfa: async () => { throw new Error("SITE_ADMIN_STEP_UP_REQUIRED"); },
      authorizationError: () => Response.json({ error: "ADMIN_STEP_UP_REQUIRED" }, { status: 403 }),
      fetchTarget: (async () => { fetched += 1; return new Response(); }) as typeof fetch,
    }),
  );
  assert.equal(blocked.status, 403);
  for (const [request, override, status] of [
    [new Request(`https://dev.game-fields.com${platformPath}`, { method: "POST" }), {}, 405],
    [new Request(`https://dev.game-fields.com${platformPath}?x=1`), {}, 400],
    [new Request(`https://dev.game-fields.com${platformPath}`), { targetUrl: () => `https://sdk.game-fields.com${portalPath}` }, 403],
    [new Request(`https://dev.game-fields.com${platformPath}`), { runtimeIdentity: () => ({ semanticEnvironment: "production", vercelEnvironment: "production", project: "app-games", ref: "main" }) }, 403],
  ] as const) {
    const response = await proxySdkMigration011Diagnostic(request, proxyDependencies(override));
    assert.equal(response.status, status);
  }
  let method = "";
  const ok = await proxySdkMigration011Diagnostic(
    new Request(`https://dev.game-fields.com${platformPath}`),
    proxyDependencies({ fetchTarget: (async (_url, init) => { method = init?.method ?? ""; return Response.json(validPayload()); }) as typeof fetch }),
  );
  assert.equal(ok.status, 200);
  assert.equal(method, "GET");
  assert.equal(fetched, 0);
});

test("Platform strict allowlist rejects extra fields, malformed hashes, and mismatched binding", async () => {
  for (const mutate of [
    (payload: ReturnType<typeof validPayload>) => { Object.assign(payload, { databaseUrl: "postgres://secret" }); },
    (payload: ReturnType<typeof validPayload>) => { Object.assign(payload.ledger[0], { raw: "secret" }); },
    (payload: ReturnType<typeof validPayload>) => { payload.databaseTargetFingerprint = "bad"; },
    (payload: ReturnType<typeof validPayload>) => { payload.databaseNameFingerprint = "0".repeat(64); },
  ]) {
    const payload = validPayload();
    mutate(payload);
    const response = await proxySdkMigration011Diagnostic(
      new Request(`https://dev.game-fields.com${platformPath}`),
      proxyDependencies({ fetchTarget: (async () => Response.json(payload)) as typeof fetch }),
    );
    assert.equal(response.status, 502);
  }
});

test("diagnostic routes expose GET only and diagnostic SQL contains no mutation path", () => {
  const files = [
    "app/api/admin/sdk-migration-011/diagnostic/route.ts",
    "apps/sdk-portal/app/api/internal/operations/migration-011/diagnostic/route.ts",
    "apps/sdk-portal/lib/sdk-migration-011-diagnostic.ts",
  ].map((path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
  assert.equal(files.slice(0, 2).every((source) => /export async function GET/.test(source)), true);
  assert.equal(files.slice(0, 2).some((source) => /export async function POST/.test(source)), false);
  assert.match(files[2], /readOnly: true/);
  assert.doesNotMatch(files[2], /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
  const operator = readFileSync(new URL("../apps/sdk-portal/app/api/internal/operations/migration-011/route.ts", import.meta.url), "utf8");
  assert.match(operator, /export async function POST/);
});
