import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import {
  acceptsOriginalDataPreservationRequest,
  assertOriginalDataPreservationLedger,
  buildOriginalDataPreservationArchive,
  encodeOriginalDataPreservationReceipt,
  OriginalDataPreservationError,
  originalDataPreservationAdminPath,
  originalDataPreservationArchiveInvalidStages,
  originalDataPreservationInternalPath,
  originalDataPreservationReceiptHeader,
  originalDataPreservationRecordTables,
  originalDataPreservationSchema9AcceptedLegacyEntries,
  originalDataPreservationSchema9Ledger,
  verifyOriginalDataPreservationArchive,
  type OriginalDataPreservationSnapshot,
  type OriginalDataPreservationTarget,
} from "../apps/sdk-portal/lib/original-data-preservation.ts";
import { readOriginalDataPreservationSnapshot } from "../apps/sdk-portal/lib/original-data-preservation-store.ts";
import { processOriginalDataPreservationRequest } from "../apps/sdk-portal/lib/original-data-preservation-route.ts";
import { extractStoredZip } from "../apps/sdk-portal/lib/stored-zip.ts";
import {
  originalDataPreservationAdminPath as proxyAdminPath,
  originalDataPreservationInternalPath as proxyInternalPath,
  originalDataPreservationReceiptHeader as proxyReceiptHeader,
  proxyOriginalDataPreservation,
  type OriginalDataPreservationSafeReceipt,
} from "../lib/original-data-preservation-proxy.ts";
import { verifyOriginalDataOfflineArchive } from "../lib/original-data-offline-verifier.ts";
import {
  formatOriginalDataPreservationArchiveInvalidStage,
  originalDataPreservationArchiveInvalidStages as platformArchiveInvalidStages,
  parseOriginalDataPreservationArchiveInvalidStage,
} from "../lib/original-data-preservation-stage.ts";

const sourceMainCommit = "3".repeat(40);
const sourceDeploymentFingerprint = "4".repeat(64);
const sourceDatabaseFingerprint = "5".repeat(64);
const snapshotFingerprint = "6".repeat(64);
const packageRevision = "1".repeat(40);
const packageTree = "2".repeat(40);
const artifactContent = Buffer.from("fixture artifact bytes\n", "utf8");
const artifactBlob = createHash("sha1")
  .update(`blob ${artifactContent.byteLength}\0`)
  .update(artifactContent)
  .digest("hex");

function ledger() {
  return originalDataPreservationSchema9Ledger.map((row) => ({
    ...row,
    applied_at: "2026-08-23T00:00:00.000Z",
  }));
}

function knownLegacyV5Ledger() {
  const rows = ledger();
  rows[4] = {
    ...originalDataPreservationSchema9AcceptedLegacyEntries[0]!,
    applied_at: "2026-08-23T00:00:00.000Z",
  };
  return rows;
}

function targetSnapshot(target: OriginalDataPreservationTarget) {
  const creatorId = `${target}-creator-row`;
  const gameRowId = `${target}-game-row`;
  const gameId = target === "moi-lab2" ? "moi-game" : "yabo-game";
  const records = {} as OriginalDataPreservationSnapshot["targets"][number]["records"];
  for (const table of originalDataPreservationRecordTables) records[table] = [];
  records.sdk_creators.push({
    id: creatorId,
    slug: target,
    display_name: "Fixture creator",
    owner_player_id: target === "moi-lab2" ? null : "fixture-owner-yabo",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    deleted_at: "2026-08-02T00:43:00.000Z",
  });
  records.sdk_games.push({
    id: gameRowId,
    creator_id: creatorId,
    game_id: gameId,
    title: "Fixture title",
    description: "Fixture description",
    manifest: { id: gameId, sdkVersion: 2 },
    module_policy: { timer: "required" },
    mock_revision: null,
    package_revision: target === "yabobojpn-lab" ? packageRevision : null,
    development_revision: null,
    stable_revision: null,
    deleted_at: null,
  });
  if (target === "yabobojpn-lab") {
    records.sdk_game_package_revisions.push({
      game_id: gameRowId,
      revision: packageRevision,
      package_root_sha256: "7".repeat(64),
      server_bundle_sha256: "8".repeat(64),
      app_set_source_sha256: "9".repeat(64),
      manifest: { id: gameId },
      sdk_package_version: "0.2.0",
      sdk_contract_version: 2,
      created_at: "2026-08-01T00:00:00.000Z",
      module_profile_revision: null,
      module_contract_digest: null,
      prototype_revision: null,
      shared_source_sha256: null,
    });
  }
  return { target, records };
}

function snapshot(): OriginalDataPreservationSnapshot {
  return {
    formatVersion: 1,
    environment: "production",
    sourceRef: "main",
    sourceMainCommit,
    sourceDeploymentFingerprint,
    sourceDatabaseFingerprint,
    snapshotFingerprint,
    observedAt: "2026-08-23T01:02:03.000Z",
    transaction: { isolationLevel: "repeatable read", readOnly: true },
    ledger: ledger(),
    targets: [targetSnapshot("moi-lab2"), targetSnapshot("yabobojpn-lab")],
  };
}

function reader(overrides: {
  missingCommit?: boolean;
  missingBlob?: boolean;
  damagedBlob?: boolean;
  mode?: string;
} = {}) {
  return {
    async readCommit(revision: string) {
      if (overrides.missingCommit || revision !== packageRevision) return null;
      return { commitSha: packageRevision, treeSha: packageTree };
    },
    async readTree(tree: string) {
      if (tree !== packageTree) return null;
      return [{
        path: "packages/yabobojpn-lab/yabo-game/bundle/index.html",
        type: "blob" as const,
        sha: artifactBlob,
        bytes: artifactContent.byteLength,
        mode: overrides.mode ?? "100644",
      }];
    },
    async readBlob(blob: string) {
      if (overrides.missingBlob || blob !== artifactBlob) return null;
      return overrides.damagedBlob ? Buffer.from("damaged") : artifactContent;
    },
  };
}

function archiveArrayBuffer(value: Buffer) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

test("one deterministic ZIP preserves both exact targets from one schema-9 snapshot", async () => {
  const first = await buildOriginalDataPreservationArchive({ snapshot: snapshot(), reader: reader() });
  const second = await buildOriginalDataPreservationArchive({ snapshot: snapshot(), reader: reader() });
  assert.deepEqual(first.archive, second.archive);
  assert.equal(first.receipt.targets[0].target, "moi-lab2");
  assert.equal(first.receipt.targets[0].artifactStatus, "ARTIFACT_SOURCE_NOT_LOCATED");
  assert.equal(first.receipt.targets[0].artifactLocatorCount, 0);
  assert.equal(first.receipt.targets[1].target, "yabobojpn-lab");
  assert.equal(first.receipt.targets[1].artifactStatus, "COMPLETE");
  assert.equal(first.receipt.targets[1].artifactLocatorCount, 1);
  assert.equal(first.receipt.zipBytes, first.archive.byteLength);
  assert.equal(first.receipt.zipSha256, createHash("sha256").update(first.archive).digest("hex"));
  assert.doesNotThrow(() => verifyOriginalDataPreservationArchive({
    archive: first.archive,
    expectedSnapshotFingerprint: snapshotFingerprint,
  }));
  const files = new Map(extractStoredZip(first.archive).map((entry) => [entry.name, entry.content]));
  assert.equal(files.has("db/moi-lab2/sdk_games.json"), true);
  assert.equal(files.has("db/yabobojpn-lab/sdk_games.json"), true);
  assert.equal(files.has("git-artifacts/moi-lab2/manifest.json"), true);
  assert.equal(files.has("git-artifacts/yabobojpn-lab/manifest.json"), true);
  assert.equal([...files.keys()].filter((path) => path.endsWith("index.html")).length, 1);
});

test("schema-9 ledger accepts only canonical or the exact known production v5 lineage", () => {
  assert.doesNotThrow(() => assertOriginalDataPreservationLedger(ledger()));
  assert.doesNotThrow(() => assertOriginalDataPreservationLedger(knownLegacyV5Ledger()));

  const nameDrift = knownLegacyV5Ledger();
  nameDrift[4] = { ...nameDrift[4]!, name: `${nameDrift[4]!.name.slice(0, -1)}x` };
  assert.throws(() => assertOriginalDataPreservationLedger(nameDrift), /A0_SCHEMA_PRECONDITION_FAILED/);

  const checksumDrift = knownLegacyV5Ledger();
  checksumDrift[4] = { ...checksumDrift[4]!, checksum: `${checksumDrift[4]!.checksum.slice(0, -1)}0` };
  assert.throws(() => assertOriginalDataPreservationLedger(checksumDrift), /A0_SCHEMA_PRECONDITION_FAILED/);
});

test("migration 010, gaps, duplicates, ordering drift, unknown versions, and other drift fail closed", () => {
  assert.throws(
    () => assertOriginalDataPreservationLedger([
      ...ledger(),
      { version: 10, name: "010.sql", checksum: "a".repeat(64), applied_at: null },
    ]),
    (error: unknown) => error instanceof OriginalDataPreservationError
      && error.code === "A0_SCHEMA_PRECONDITION_FAILED",
  );
  assert.throws(() => assertOriginalDataPreservationLedger(ledger().slice(1)), /A0_SCHEMA_PRECONDITION_FAILED/);

  const duplicated = ledger();
  duplicated[5] = { ...duplicated[4]! };
  assert.throws(() => assertOriginalDataPreservationLedger(duplicated), /A0_SCHEMA_PRECONDITION_FAILED/);

  const reordered = ledger();
  [reordered[3], reordered[4]] = [reordered[4]!, reordered[3]!];
  assert.throws(() => assertOriginalDataPreservationLedger(reordered), /A0_SCHEMA_PRECONDITION_FAILED/);

  const unknown = ledger();
  unknown[5] = { ...unknown[5]!, version: 99 };
  assert.throws(() => assertOriginalDataPreservationLedger(unknown), /A0_SCHEMA_PRECONDITION_FAILED/);

  const drifted = ledger();
  drifted[8] = { ...drifted[8]!, checksum: "0".repeat(64) };
  assert.throws(() => assertOriginalDataPreservationLedger(drifted), /A0_SCHEMA_PRECONDITION_FAILED/);
});

test("unrelated rows and credential-equivalent columns cannot enter the snapshot", async () => {
  const unrelated = snapshot();
  unrelated.targets[0].records.sdk_games.push({
    id: "outside-game",
    creator_id: "outside-creator",
    game_id: "outside",
  });
  await assert.rejects(
    buildOriginalDataPreservationArchive({ snapshot: unrelated, reader: reader() }),
    /A0_TARGET_SNAPSHOT_INCONSISTENT/,
  );
  const credential = snapshot();
  credential.targets[0].records.sdk_creators[0]!.management_token_hash = "secret-hash-sentinel";
  await assert.rejects(
    buildOriginalDataPreservationArchive({ snapshot: credential, reader: reader() }),
    /A0_TARGET_SNAPSHOT_INCONSISTENT/,
  );
});

test("artifact missing, unavailable, hash mismatch, symlink mode, and yabobojpn zero locators fail", async () => {
  for (const failingReader of [
    reader({ missingCommit: true }),
    reader({ missingBlob: true }),
    reader({ damagedBlob: true }),
    reader({ mode: "120000" }),
  ]) {
    await assert.rejects(
      buildOriginalDataPreservationArchive({ snapshot: snapshot(), reader: failingReader }),
      /A0_ARTIFACT_INCOMPLETE/,
    );
  }
  const noYaboLocator = snapshot();
  noYaboLocator.targets[1].records.sdk_games[0]!.package_revision = null;
  noYaboLocator.targets[1].records.sdk_game_package_revisions = [];
  await assert.rejects(
    buildOriginalDataPreservationArchive({ snapshot: noYaboLocator, reader: reader() }),
    /A0_TARGET_SNAPSHOT_INCONSISTENT/,
  );
});

test("high-confidence credential material in retrieved artifact bytes stops archive creation", async () => {
  const leaked = Buffer.from("POSTGRESQL://user:password@example.invalid/database", "utf8");
  const leakedBlob = createHash("sha1")
    .update(`blob ${leaked.byteLength}\0`)
    .update(leaked)
    .digest("hex");
  await assert.rejects(
    buildOriginalDataPreservationArchive({
      snapshot: snapshot(),
      reader: {
        async readCommit() { return { commitSha: packageRevision, treeSha: packageTree }; },
        async readTree() {
          return [{
            path: "packages/yabobojpn-lab/yabo-game/bundle/index.html",
            type: "blob",
            sha: leakedBlob,
            bytes: leaked.byteLength,
            mode: "100644",
          }];
        },
        async readBlob() { return leaked; },
      },
    }),
    /A0_TARGET_SNAPSHOT_INCONSISTENT/,
  );
});

test("request surface accepts only fixed empty-body methods and rejects override channels", () => {
  assert.equal(acceptsOriginalDataPreservationRequest(
    new Request(`https://sdk.example${originalDataPreservationInternalPath}`, { method: "POST" }),
    originalDataPreservationInternalPath,
    "POST",
  ), true);
  assert.equal(acceptsOriginalDataPreservationRequest(
    new Request(`https://app.example${originalDataPreservationAdminPath}`, { method: "GET" }),
    originalDataPreservationAdminPath,
    "GET",
  ), true);
  for (const request of [
    new Request(`https://sdk.example${originalDataPreservationInternalPath}?slug=moi-lab2`, { method: "POST" }),
    new Request(`https://sdk.example${originalDataPreservationInternalPath}`, { method: "PUT" }),
    new Request(`https://sdk.example${originalDataPreservationInternalPath}/moi-lab2`, { method: "POST" }),
    new Request(`https://sdk.example${originalDataPreservationInternalPath.toUpperCase()}`, { method: "POST" }),
    new Request(`https://sdk.example${originalDataPreservationInternalPath}`, { method: "POST", headers: { "x-target-slug": "moi-lab2" } }),
  ]) {
    assert.equal(acceptsOriginalDataPreservationRequest(
      request,
      originalDataPreservationInternalPath,
      "POST",
    ), false);
  }
});

test("database export uses exactly one repeatable-read read-only transaction and explicit SELECTs", async () => {
  const base = snapshot();
  const queryTexts: string[] = [];
  let transactionCount = 0;
  let transactionOptions: unknown;
  const resultSets: unknown[] = [
    [{
      observed_at: base.observedAt,
      isolation_level: "repeatable read",
      transaction_read_only: "on",
      snapshot_id: "100:200:",
    }],
    base.ledger,
    base.targets.flatMap((target) => target.records.sdk_creators),
    base.targets.flatMap((target) => target.records.sdk_games),
    base.targets.flatMap((target) => target.records.sdk_game_package_revisions),
    [], [], [], [], [], [], [], [],
  ];
  const fakeSql = {
    async transaction(callback: (tx: unknown) => unknown[], options: unknown) {
      transactionCount += 1;
      transactionOptions = options;
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => {
        queryTexts.push(strings.reduce((text, part, index) => `${text}${part}${index < values.length ? "$" : ""}`, ""));
        return { strings, values };
      };
      const queries = callback(tx);
      assert.equal(queries.length, 13);
      return resultSets;
    },
  } as unknown as NeonQueryFunction<boolean, boolean>;
  const result = await readOriginalDataPreservationSnapshot({
    sql: fakeSql,
    binding: {
      selectedKey: "SDK_DATABASE_URL",
      fallbackUsed: false,
      databaseUrl: "postgresql://fixture-user:fixture-password@fixture.invalid/sdk",
    },
    secret: "s".repeat(64),
    sourceMainCommit,
    sourceDeploymentIdentity: "fixture-production-deployment",
  });
  assert.equal(transactionCount, 1);
  assert.deepEqual(transactionOptions, { isolationLevel: "RepeatableRead", readOnly: true });
  assert.equal(result.targets[0].target, "moi-lab2");
  assert.equal(result.targets[1].target, "yabobojpn-lab");
  assert.match(queryTexts.join("\n"), /current_setting\('transaction_read_only'\)/);
  assert.doesNotMatch(queryTexts.join("\n"), /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|CALL)\b/i);
  assert.doesNotMatch(queryTexts.join("\n"), /management_token_hash|access_token_hash|refresh_token_hash|code_hash|code_challenge/i);
  assert.doesNotMatch(JSON.stringify(result), /fixture-password|fixture-user/);
});

test("database selector fallback and noncanonical source identity fail before a transaction", async () => {
  let transactions = 0;
  const fakeSql = {
    async transaction() { transactions += 1; return []; },
  } as unknown as NeonQueryFunction<boolean, boolean>;
  await assert.rejects(readOriginalDataPreservationSnapshot({
    sql: fakeSql,
    binding: { selectedKey: "DATABASE_URL", fallbackUsed: true, databaseUrl: "postgresql://invalid" },
    secret: "s".repeat(64),
    sourceMainCommit,
    sourceDeploymentIdentity: "deployment",
  }), /A0_SOURCE_IDENTITY_INVALID/);
  assert.equal(transactions, 0);

  const schemaErrorSql = {
    async transaction() { throw Object.assign(new Error("missing table"), { code: "42P01" }); },
  } as unknown as NeonQueryFunction<boolean, boolean>;
  await assert.rejects(readOriginalDataPreservationSnapshot({
    sql: schemaErrorSql,
    binding: { selectedKey: "SDK_DATABASE_URL", fallbackUsed: false, databaseUrl: "postgresql://fixture.invalid/sdk" },
    secret: "s".repeat(64),
    sourceMainCommit,
    sourceDeploymentIdentity: "deployment",
  }), (error: unknown) => error instanceof OriginalDataPreservationError
    && error.code === "A0_SCHEMA_PRECONDITION_FAILED");
});

test("internal operator authorizes first, rejects dev/input smuggling, and emits only fixed safe logs", async () => {
  const built = await buildOriginalDataPreservationArchive({ snapshot: snapshot(), reader: reader() });
  const logs: Record<string, unknown>[] = [];
  let reads = 0;
  const dependencies = {
    authorize: () => undefined,
    runtimeIdentity: () => ({
      environment: "production" as const,
      sourceRef: "main",
      sourceMainCommit,
      sourceDeploymentIdentity: "production-deployment",
    }),
    databaseContext: () => ({
      sql: null as never,
      binding: { selectedKey: "SDK_DATABASE_URL" as const, fallbackUsed: false, databaseUrl: "not-observed" },
    }),
    serviceSecret: () => "s".repeat(64),
    artifactReader: reader,
    readSnapshot: async () => { reads += 1; return snapshot(); },
    buildArchive: async () => built,
    log: (event: Record<string, unknown>) => logs.push(event),
  };
  const response = await processOriginalDataPreservationRequest(
    new Request(`https://sdk.example${originalDataPreservationInternalPath}`, { method: "POST" }),
    dependencies,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.equal(response.headers.get("content-length"), String(built.archive.byteLength));
  assert.ok(response.headers.get(originalDataPreservationReceiptHeader));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), built.archive);
  assert.equal(reads, 1);
  assert.doesNotMatch(JSON.stringify(logs), /Fixture creator|Fixture title|fixture-owner|not-observed/);

  const wrongEnvironment = await processOriginalDataPreservationRequest(
    new Request(`https://sdk.example${originalDataPreservationInternalPath}`, { method: "POST" }),
    { ...dependencies, runtimeIdentity: () => ({ ...dependencies.runtimeIdentity(), environment: "development" as const }) },
  );
  assert.equal(wrongEnvironment.status, 409);
  const smuggled = await processOriginalDataPreservationRequest(
    new Request(`https://sdk.example${originalDataPreservationInternalPath}`, {
      method: "POST",
      headers: { "x-migration": "010" },
    }),
    dependencies,
  );
  assert.equal(smuggled.status, 400);
  assert.equal(reads, 1);
});

test("internal operator returns no receipt when generation fails", async () => {
  const response = await processOriginalDataPreservationRequest(
    new Request(`https://sdk.example${originalDataPreservationInternalPath}`, { method: "POST" }),
    {
      authorize: () => undefined,
      runtimeIdentity: () => ({
        environment: "production",
        sourceRef: "main",
        sourceMainCommit,
        sourceDeploymentIdentity: "production-deployment",
      }),
      databaseContext: () => ({ sql: null as never, binding: { selectedKey: "SDK_DATABASE_URL", fallbackUsed: false, databaseUrl: "unused" } }),
      serviceSecret: () => "s".repeat(64),
      artifactReader: reader,
      readSnapshot: async () => snapshot(),
      buildArchive: async () => { throw new OriginalDataPreservationError("A0_ARTIFACT_INCOMPLETE"); },
      log: () => undefined,
    },
  );
  assert.equal(response.status, 409);
  assert.equal(response.headers.has(originalDataPreservationReceiptHeader), false);
  assert.deepEqual(await response.json(), {
    schemaVersion: 1,
    phaseId: "T-131-A0",
    status: "STOPPED",
    code: "A0_ARTIFACT_INCOMPLETE",
    secretFree: true,
  });
});

test("archive-invalid stage contract is exact, shared, and UI formatting fails closed", () => {
  const expected = [
    "INTERNAL_ARCHIVE_STRUCTURE_VERIFY",
    "INTERNAL_RECEIPT_ENCODE",
    "PROXY_UPSTREAM_ARCHIVE_INVALID",
    "PROXY_RECEIPT_DECODE_OR_SHAPE",
    "PROXY_SOURCE_COMMIT",
    "PROXY_CONTENT_TYPE",
    "PROXY_CONTENT_DISPOSITION",
    "PROXY_DECLARED_LENGTH_OR_CEILING",
    "PROXY_RECEIVED_LENGTH",
    "PROXY_RECEIVED_SHA256",
  ];
  assert.deepEqual(originalDataPreservationArchiveInvalidStages, expected);
  assert.deepEqual(platformArchiveInvalidStages, expected);
  for (const stage of expected) {
    assert.equal(parseOriginalDataPreservationArchiveInvalidStage(stage), stage);
    assert.equal(formatOriginalDataPreservationArchiveInvalidStage(stage), ` / ${stage}`);
  }
  for (const invalid of [null, undefined, 1, {}, [], "", "UNKNOWN", "PROXY_SOURCE_COMMIT\nraw"]) {
    assert.equal(parseOriginalDataPreservationArchiveInvalidStage(invalid), null);
    assert.equal(formatOriginalDataPreservationArchiveInvalidStage(invalid), "");
  }
});

test("internal operator assigns only the two exact archive-invalid stages", async () => {
  const request = () => new Request(
    `https://sdk.example${originalDataPreservationInternalPath}`,
    { method: "POST" },
  );
  const dependencies = {
    authorize: () => undefined,
    runtimeIdentity: () => ({
      environment: "production" as const,
      sourceRef: "main",
      sourceMainCommit,
      sourceDeploymentIdentity: "production-deployment",
    }),
    databaseContext: () => ({
      sql: null as never,
      binding: { selectedKey: "SDK_DATABASE_URL" as const, fallbackUsed: false, databaseUrl: "unused" },
    }),
    serviceSecret: () => "s".repeat(64),
    artifactReader: reader,
    readSnapshot: async () => snapshot(),
    log: () => undefined,
  };
  const archiveFailure = await processOriginalDataPreservationRequest(request(), {
    ...dependencies,
    buildArchive: async () => { throw new OriginalDataPreservationError("A0_ARCHIVE_INVALID"); },
  });
  assert.equal(archiveFailure.status, 409);
  assert.equal((await archiveFailure.json()).archiveInvalidStage, "INTERNAL_ARCHIVE_STRUCTURE_VERIFY");

  const built = await buildOriginalDataPreservationArchive({ snapshot: snapshot(), reader: reader() });
  const receiptFailure = await processOriginalDataPreservationRequest(request(), {
    ...dependencies,
    buildArchive: async () => ({
      ...built,
      receipt: { ...built.receipt, zipBytes: 0 },
    }),
  });
  assert.equal(receiptFailure.status, 409);
  assert.equal((await receiptFailure.json()).archiveInvalidStage, "INTERNAL_RECEIPT_ENCODE");
});

test("Site Admin proxy requires recent MFA and exact production/main identity before SDK fetch", async () => {
  let fetches = 0;
  const baseDependencies = {
    requireRecentMfa: async () => undefined,
    authorizationError: () => null,
    runtimeIdentity: () => ({ environment: "production" as const, sourceRef: "main", sourceMainCommit }),
    targetUrl: () => `https://sdk.example${proxyInternalPath}`,
    serviceHeaders: () => ({ "x-test-service": "signed" }),
    fetchTarget: async () => { fetches += 1; return new Response(); },
  };
  const noMfa = await proxyOriginalDataPreservation(
    new Request(`https://app.example${proxyAdminPath}`, { method: "POST" }),
    { ...baseDependencies, requireRecentMfa: async () => { throw new Error("SITE_ADMIN_STEP_UP_REQUIRED"); } },
  );
  assert.equal(noMfa.status, 403);
  const development = await proxyOriginalDataPreservation(
    new Request(`https://app.example${proxyAdminPath}`, { method: "POST" }),
    { ...baseDependencies, runtimeIdentity: () => ({ environment: "development", sourceRef: "develop", sourceMainCommit }) },
  );
  assert.equal(development.status, 409);
  const smuggled = await proxyOriginalDataPreservation(
    new Request(`https://app.example${proxyAdminPath}?target=moi-lab2`, { method: "POST" }),
    baseDependencies,
  );
  assert.equal(smuggled.status, 400);
  assert.equal(fetches, 0);
});

test("Site Admin proxy verifies complete upstream bytes and streams the fixed ZIP", async () => {
  const built = await buildOriginalDataPreservationArchive({ snapshot: snapshot(), reader: reader() });
  const receiptValue = encodeOriginalDataPreservationReceipt(built.receipt);
  const upstream = () => new Response(built.archive, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${built.receipt.filename}"`,
      "Content-Length": String(built.archive.byteLength),
      [proxyReceiptHeader]: receiptValue,
    },
  });
  const dependencies = {
    requireRecentMfa: async () => undefined,
    authorizationError: () => null,
    runtimeIdentity: () => ({ environment: "production" as const, sourceRef: "main", sourceMainCommit }),
    targetUrl: () => `https://sdk.example${proxyInternalPath}`,
    serviceHeaders: () => ({ "x-test-service": "signed" }),
    fetchTarget: async () => upstream(),
  };
  const response = await proxyOriginalDataPreservation(
    new Request(`https://app.example${proxyAdminPath}`, { method: "POST" }),
    dependencies,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get(proxyReceiptHeader), receiptValue);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), built.archive);

  const damaged = await proxyOriginalDataPreservation(
    new Request(`https://app.example${proxyAdminPath}`, { method: "POST" }),
    {
      ...dependencies,
      fetchTarget: async () => {
        const value = upstream();
        const bytes = new Uint8Array(await value.arrayBuffer());
        bytes[0] ^= 0xff;
        return new Response(bytes, { headers: value.headers });
      },
    },
  );
  assert.equal(damaged.status, 502);
  assert.equal(damaged.headers.has(proxyReceiptHeader), false);
});

test("Site Admin proxy preserves only exact internal stages and collapses all other upstream values", async () => {
  const baseDependencies = {
    requireRecentMfa: async () => undefined,
    authorizationError: () => null,
    runtimeIdentity: () => ({ environment: "production" as const, sourceRef: "main", sourceMainCommit }),
    targetUrl: () => `https://sdk.example${proxyInternalPath}`,
    serviceHeaders: () => ({ "x-test-service": "signed" }),
    fetchTarget: async () => new Response(),
  };
  const upstreamFailure = (archiveInvalidStage?: unknown, code = "A0_ARCHIVE_INVALID") =>
    new Response(JSON.stringify({
      schemaVersion: 1,
      phaseId: "T-131-A0",
      status: "STOPPED",
      code,
      ...(archiveInvalidStage === undefined ? {} : { archiveInvalidStage }),
      secretFree: true,
    }), { status: 409, headers: { "Content-Type": "application/json" } });
  for (const stage of [
    "INTERNAL_ARCHIVE_STRUCTURE_VERIFY",
    "INTERNAL_RECEIPT_ENCODE",
  ]) {
    const response = await proxyOriginalDataPreservation(
      new Request(`https://app.example${proxyAdminPath}`, { method: "POST" }),
      { ...baseDependencies, fetchTarget: async () => upstreamFailure(stage) },
    );
    assert.deepEqual(await response.json(), {
      schemaVersion: 1,
      phaseId: "T-131-A0",
      status: "STOPPED",
      code: "A0_ARCHIVE_INVALID",
      archiveInvalidStage: stage,
      secretFree: true,
    });
  }
  for (const stage of [
    undefined,
    null,
    1,
    "",
    "UNKNOWN",
    "PROXY_SOURCE_COMMIT",
    "INTERNAL_RECEIPT_ENCODE\nraw",
  ]) {
    const response = await proxyOriginalDataPreservation(
      new Request(`https://app.example${proxyAdminPath}`, { method: "POST" }),
      { ...baseDependencies, fetchTarget: async () => upstreamFailure(stage) },
    );
    assert.equal((await response.json()).archiveInvalidStage, "PROXY_UPSTREAM_ARCHIVE_INVALID");
  }
  const nonA0 = await proxyOriginalDataPreservation(
    new Request(`https://app.example${proxyAdminPath}`, { method: "POST" }),
    { ...baseDependencies, fetchTarget: async () => upstreamFailure("INTERNAL_RECEIPT_ENCODE", "A0_ARTIFACT_INCOMPLETE") },
  );
  assert.equal("archiveInvalidStage" in await nonA0.json(), false);
});

test("Site Admin proxy assigns one exact stage to every local archive guard", async () => {
  const built = await buildOriginalDataPreservationArchive({ snapshot: snapshot(), reader: reader() });
  const baseReceipt = built.receipt as OriginalDataPreservationSafeReceipt;
  const encodeReceipt = (receipt: OriginalDataPreservationSafeReceipt) =>
    Buffer.from(JSON.stringify(receipt), "utf8").toString("base64url");
  const upstream = (input: {
    receipt?: OriginalDataPreservationSafeReceipt | null;
    contentType?: string;
    disposition?: string;
    declaredLength?: number;
    archive?: Uint8Array;
  } = {}) => {
    const receipt = input.receipt === undefined ? baseReceipt : input.receipt;
    const archive = input.archive ?? built.archive;
    const headers = new Headers({
      "Content-Type": input.contentType ?? "application/zip",
      "Content-Disposition": input.disposition ?? `attachment; filename="${baseReceipt.filename}"`,
      "Content-Length": String(input.declaredLength ?? archive.byteLength),
    });
    if (receipt) headers.set(proxyReceiptHeader, encodeReceipt(receipt));
    return new Response(archive, { headers });
  };
  const dependencies = {
    requireRecentMfa: async () => undefined,
    authorizationError: () => null,
    runtimeIdentity: () => ({ environment: "production" as const, sourceRef: "main", sourceMainCommit }),
    targetUrl: () => `https://sdk.example${proxyInternalPath}`,
    serviceHeaders: () => ({ "x-test-service": "signed" }),
    fetchTarget: async () => upstream(),
  };
  const cases: Array<{
    stage: string;
    response: Response;
  }> = [
    { stage: "PROXY_RECEIPT_DECODE_OR_SHAPE", response: upstream({ receipt: null }) },
    {
      stage: "PROXY_SOURCE_COMMIT",
      response: upstream({ receipt: { ...baseReceipt, sourceMainCommit: "a".repeat(40) } }),
    },
    { stage: "PROXY_CONTENT_TYPE", response: upstream({ contentType: "application/json" }) },
    { stage: "PROXY_CONTENT_DISPOSITION", response: upstream({ disposition: "attachment" }) },
    {
      stage: "PROXY_DECLARED_LENGTH_OR_CEILING",
      response: upstream({ declaredLength: built.archive.byteLength + 1 }),
    },
    {
      stage: "PROXY_DECLARED_LENGTH_OR_CEILING",
      response: upstream({
        receipt: { ...baseReceipt, zipBytes: 300 * 1024 * 1024 + 1 },
        declaredLength: 300 * 1024 * 1024 + 1,
      }),
    },
    {
      stage: "PROXY_RECEIVED_LENGTH",
      response: upstream({
        receipt: { ...baseReceipt, zipBytes: built.archive.byteLength + 1 },
        declaredLength: built.archive.byteLength + 1,
      }),
    },
    {
      stage: "PROXY_RECEIVED_SHA256",
      response: upstream({
        receipt: { ...baseReceipt, zipSha256: "a".repeat(64) },
      }),
    },
  ];
  for (const fixture of cases) {
    const response = await proxyOriginalDataPreservation(
      new Request(`https://app.example${proxyAdminPath}`, { method: "POST" }),
      { ...dependencies, fetchTarget: async () => fixture.response },
    );
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      schemaVersion: 1,
      phaseId: "T-131-A0",
      status: "STOPPED",
      code: "A0_ARCHIVE_INVALID",
      archiveInvalidStage: fixture.stage,
      secretFree: true,
    });
  }
});

test("browser local verifier checks outer digest, extraction, manifest, counts, and every entry without upload", async () => {
  const built = await buildOriginalDataPreservationArchive({ snapshot: snapshot(), reader: reader() });
  const verified = await verifyOriginalDataOfflineArchive(
    archiveArrayBuffer(built.archive),
    built.receipt,
  );
  assert.equal(verified.verdict, "PASS");
  assert.equal(verified.targetCount, 2);
  assert.equal(verified.internallyHashedEntryCount, verified.entryCount - 1);
  const damaged = Buffer.from(built.archive);
  damaged[50] ^= 0xff;
  await assert.rejects(
    verifyOriginalDataOfflineArchive(archiveArrayBuffer(damaged), built.receipt),
    /A0_LOCAL_ZIP_SHA256_MISMATCH/,
  );
  const clientSource = readFileSync("app/admin/OriginalDataPreservationPanel.tsx", "utf8");
  const verifierStart = clientSource.indexOf("const verifySavedZip");
  const verifierEnd = clientSource.indexOf("const inspectEncryptedContainer", verifierStart);
  assert.ok(verifierStart > 0 && verifierEnd > verifierStart);
  assert.match(clientSource.slice(verifierStart, verifierEnd), /file\.arrayBuffer\(\)/);
  assert.doesNotMatch(clientSource.slice(verifierStart, verifierEnd), /fetch\s*\(/);
});

test("A0 source cannot call migration, recovery, owner binding, publication, or persistence writes", () => {
  const paths = [
    "apps/sdk-portal/lib/original-data-preservation.ts",
    "apps/sdk-portal/lib/original-data-preservation-store.ts",
    "apps/sdk-portal/lib/original-data-preservation-route.ts",
    "apps/sdk-portal/app/api/internal/operations/original-data-preservation/route.ts",
    "lib/original-data-preservation-proxy.ts",
    "app/api/admin/sdk-original-data-preservation/route.ts",
  ];
  const source = paths.map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /ensureSdkSchema|sdk-migration-010|creator-quarantine|owner-binding|sdk-promotions/i);
  const storeSource = readFileSync("apps/sdk-portal/lib/original-data-preservation-store.ts", "utf8");
  assert.doesNotMatch(storeSource, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|CALL)\b/i);
  assert.match(storeSource, /isolationLevel: "RepeatableRead", readOnly: true/);
});

test("A0 changes do not require edits to any fixed A1-owned source path", () => {
  const internal = readFileSync(
    "apps/sdk-portal/app/api/internal/operations/original-data-preservation/route.ts",
    "utf8",
  );
  const proxy = readFileSync("app/api/admin/sdk-original-data-preservation/route.ts", "utf8");
  assert.match(internal, /requireSdkServiceRequest/);
  assert.match(internal, /sdkSql\(\)/);
  assert.match(proxy, /sdkServiceHeaders/);
  assert.doesNotMatch(internal + proxy, /migration-010|PRESERVE_SOURCE|targetSlug/);
});
