import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalSdkAuditDigest,
  createSdkSchemaAuditSnapshot,
  loadSdkSchemaAuditSnapshot,
  type SdkSchemaAuditInput,
} from "../apps/sdk-portal/lib/sdk-schema-audit-snapshot.ts";
import {
  proxySiteAdminSdkAuditGet,
} from "../lib/site-admin-sdk-audit-proxy.ts";
import {
  RuntimeArtifactError,
  gameFieldsPackageRootSha256,
  resolveRuntimeExecutionArtifact,
  runtimeManifestSha256,
  type RuntimeArtifactReader,
} from "../packages/sdk-runtime-artifact/src/index.ts";
import {
  resolveRuntimeArtifactAudit,
} from "../apps/sdk-portal/lib/runtime-manifest-audit.ts";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const revision = "a".repeat(40);

function snapshotRows(): SdkSchemaAuditInput {
  return {
    schemaVersion: 10,
    deploymentEnvironment: "development" as const,
    observedAt: "2026-08-01T00:00:00.000Z",
    games: [{
      creatorSlug: "creator-lab",
      gameId: "sample-game",
      publicGameId: "sample-public",
      status: "stable",
      deletedAt: null,
      packageRevision: "b".repeat(40),
      packageRootSha256: "1".repeat(64),
      packageBundleSha256: "2".repeat(64),
      packageAppSetSha256: "3".repeat(64),
      manifest: { sdkVersion: 1, id: "sample-game", title: "candidate" },
      sdkPackageVersion: "0.1.1",
      sdkContractVersion: 1,
      stableRevision: revision,
      stableRootSha256: "4".repeat(64),
      stableBundleSha256: "5".repeat(64),
      stableAppSetSha256: "6".repeat(64),
      stableManifest: { sdkVersion: 1, id: "sample-game", title: "stable" },
    }],
    currentReleases: [{
      id: "release-1",
      lineageId: "creator-lab/sample-game",
      publicGameId: "sample-public",
      sourceCreatorSlug: "creator-lab",
      sourceGameId: "sample-game",
      revision,
      sourceRevision: "c".repeat(40),
      packageRootSha256: "4".repeat(64),
      serverBundleSha256: "5".repeat(64),
      appSetSourceSha256: "6".repeat(64),
      manifest: { sdkVersion: 1, id: "sample-game", title: "stable" },
      modulePolicy: { timer: { mode: "required" } },
      sourceEnvironment: "development",
      releaseKind: "promote",
      restoredFrom: null,
      releasedAt: "2026-07-31T00:00:00.000Z",
      decisionId: "decision-1",
      decisionAction: "approve",
      decisionRevision: revision,
      decisionPackageRootSha256: "4".repeat(64),
      decisionSourceEnvironment: "development",
      decisionTargetEnvironment: "development",
      decisionAt: "2026-07-31T00:00:00.000Z",
    }],
  };
}

test("schema 10 preserves the schema-9 unavailable markers without inventing database provenance", () => {
  const snapshot = createSdkSchemaAuditSnapshot(snapshotRows());
  assert.deepEqual(snapshot.environment, {
    deployment: "development",
    database: null,
    databaseAvailability: "unavailable:schema-9",
  });
  assert.equal(snapshot.games[0]?.stable.sourceRevision, null);
  assert.equal(snapshot.games[0]?.stable.sourceRevisionAvailability, "unavailable:schema-9");
  assert.equal(snapshot.games[0]?.status, "stable");
  assert.equal(snapshot.games[0]?.statusAvailability, "complete");
  assert.equal(snapshot.games[0]?.candidate.availability, "complete");
  assert.deepEqual(snapshot.games[0]?.package, snapshot.games[0]?.candidate);
  assert.equal(snapshot.games[0]?.stable.availability, "complete");
  assert.equal(snapshot.games[0]?.stable.manifestSha256, runtimeManifestSha256(snapshotRows().games[0]!.stableManifest));
  assert.equal(snapshot.currentReleases[0]?.availability, "complete");
  assert.equal(snapshot.currentReleases[0]?.kind, "promote");
  assert.equal(snapshot.currentReleases[0]?.manifestSha256, runtimeManifestSha256(snapshotRows().currentReleases[0]!.manifest));
  assert.deepEqual(snapshot.currentReleases[0]?.latestDecision, {
    id: "decision-1",
    availability: "complete",
    action: "approve",
    revision,
    packageRootSha256: "4".repeat(64),
    sourceEnvironment: "development",
    targetEnvironment: "development",
    decidedAt: "2026-07-31T00:00:00.000Z",
  });
  assert.deepEqual(snapshot.currentReleases[0]?.decision, {
    action: "approve",
    revision,
    packageRootSha256: "4".repeat(64),
    sourceEnvironment: "development",
    targetEnvironment: "development",
    decidedAt: "2026-07-31T00:00:00.000Z",
  });
  assert.deepEqual(snapshot.anomalies.stableSourceRevisionUnavailable, ["creator-lab/sample-game"]);
  assert.notEqual(snapshot.currentReleases[0]?.sourceRevision, snapshot.games[0]?.stable.sourceRevision);
});

test("snapshot classifies each current/stable anomaly independently", () => {
  const input = snapshotRows();
  input.games.push(
    {
      ...input.games[0]!,
      creatorSlug: "stable-only",
      gameId: "stable-only",
      publicGameId: "stable-only",
      status: null,
      stableRevision: null,
      stableRootSha256: "7".repeat(64),
      stableBundleSha256: null,
      stableAppSetSha256: null,
      stableManifest: null,
    },
    {
      ...input.games[0]!,
      creatorSlug: "current-only",
      gameId: "current-only",
      publicGameId: "current-only",
      status: "draft",
      stableRevision: null,
      stableRootSha256: null,
      stableBundleSha256: null,
      stableAppSetSha256: null,
      stableManifest: null,
    },
    {
      ...input.games[0]!,
      creatorSlug: "deleted",
      gameId: "deleted",
      publicGameId: "deleted-public",
      deletedAt: "2026-07-01T00:00:00.000Z",
    },
  );
  input.currentReleases.push(
    { ...input.currentReleases[0]!, id: "release-2", lineageId: "current-only/current-only", publicGameId: "current-only", sourceCreatorSlug: "current-only", sourceGameId: "current-only" },
    { ...input.currentReleases[0]!, id: "release-3", lineageId: "deleted/deleted", publicGameId: "deleted-public", sourceCreatorSlug: "deleted", sourceGameId: "deleted" },
    { ...input.currentReleases[0]!, id: "release-4", lineageId: "orphan/missing", publicGameId: "orphan-public", sourceCreatorSlug: "orphan", sourceGameId: "missing" },
    { ...input.currentReleases[0]!, id: "release-5" },
    { ...input.currentReleases[0]!, id: "release-6", lineageId: "other/lineage", publicGameId: "sample-public", sourceCreatorSlug: "other", sourceGameId: "lineage" },
  );
  const anomalies = createSdkSchemaAuditSnapshot(input).anomalies;
  assert.deepEqual(anomalies.partialStable, ["stable-only/stable-only"]);
  assert.deepEqual(anomalies.stableAbsent, ["current-only/current-only"]);
  assert.deepEqual(anomalies.currentAbsent, ["stable-only/stable-only"]);
  assert.deepEqual(anomalies.stableWithoutCurrent, ["stable-only/stable-only"]);
  assert.deepEqual(anomalies.currentWithoutStable, ["current-only/current-only"]);
  assert.deepEqual(anomalies.deletedCurrentRelease, ["deleted/deleted"]);
  assert.deepEqual(anomalies.tombstonedCurrentRelease, ["deleted/deleted"]);
  assert.deepEqual(anomalies.orphanCurrentRelease, ["orphan/missing", "other/lineage"]);
  assert.deepEqual(anomalies.multipleCurrentByLineage, ["creator-lab/sample-game"]);
  assert.deepEqual(anomalies.multipleCurrentByPublicGameId, ["sample-public"]);
  assert.deepEqual(anomalies.gameStatusMissing, ["stable-only/stable-only"]);
  assert.deepEqual(anomalies.gameStatusMismatch, ["current-only/current-only", "deleted/deleted"]);

  const missingInput = snapshotRows();
  Object.assign(missingInput.currentReleases[0]!, {
    manifest: null,
    decisionId: null,
    decisionAction: null,
    decisionRevision: null,
    decisionPackageRootSha256: null,
    decisionSourceEnvironment: null,
    decisionTargetEnvironment: null,
    decisionAt: null,
  });
  missingInput.games[0]!.stableManifest = null;
  const missing = createSdkSchemaAuditSnapshot(missingInput).anomalies;
  assert.deepEqual(missing.partialStable, ["creator-lab/sample-game"]);
  assert.deepEqual(missing.partialCurrent, ["creator-lab/sample-game"]);
  assert.deepEqual(missing.decisionMissing, ["creator-lab/sample-game"]);
  assert.deepEqual(missing.stableManifestHashMissing, ["creator-lab/sample-game"]);
  assert.deepEqual(missing.currentManifestHashMissing, ["creator-lab/sample-game"]);

  const mismatchInput = snapshotRows();
  Object.assign(mismatchInput.currentReleases[0]!, {
    revision: "d".repeat(40),
    manifest: { sdkVersion: 1, id: "sample-game", title: "different" },
    decisionRevision: "e".repeat(40),
    decisionPackageRootSha256: "8".repeat(64),
    decisionSourceEnvironment: "production",
    decisionTargetEnvironment: "production",
  });
  const mismatch = createSdkSchemaAuditSnapshot(mismatchInput).anomalies;
  assert.deepEqual(mismatch.decisionMismatch, ["creator-lab/sample-game"]);
  assert.deepEqual(mismatch.stableCurrentRevisionMismatch, ["creator-lab/sample-game"]);
  assert.deepEqual(mismatch.stableCurrentManifestMismatch, ["creator-lab/sample-game"]);

  const partialDecisionInput = snapshotRows();
  partialDecisionInput.currentReleases[0]!.decisionId = null;
  assert.deepEqual(
    createSdkSchemaAuditSnapshot(partialDecisionInput).anomalies.decisionPartial,
    ["creator-lab/sample-game"],
  );
});

test("canonical digest is row-order independent and covers every integrity-bearing field", () => {
  const base = snapshotRows();
  const first = createSdkSchemaAuditSnapshot(base);
  const reordered = createSdkSchemaAuditSnapshot({
    ...base,
    games: [...base.games].reverse(),
    currentReleases: [...base.currentReleases].reverse(),
  });
  assert.equal(first.integrityDigest, reordered.integrityDigest);

  const mutations: Array<(value: ReturnType<typeof snapshotRows>) => void> = [
    (value) => { value.games[0]!.stableRevision = "d".repeat(40); },
    (value) => { value.games[0]!.packageRevision = "e".repeat(40); },
    (value) => { value.games[0]!.stableRootSha256 = "7".repeat(64); },
    (value) => { value.games[0]!.stableManifest = { sdkVersion: 2, id: "sample-game" }; },
    (value) => { value.games[0]!.sdkPackageVersion = "0.1.2"; },
    (value) => { value.currentReleases[0]!.sourceRevision = "f".repeat(40); },
    (value) => { value.currentReleases[0]!.decisionAction = "rollback"; },
    (value) => { value.currentReleases[0]!.decisionTargetEnvironment = "production"; },
    (value) => { value.currentReleases[0]!.decisionId = "decision-2"; },
    (value) => { value.currentReleases[0]!.modulePolicy = { timer: { mode: "disabled" } }; },
    (value) => { value.games[0]!.status = "submitted"; },
  ];
  for (const mutate of mutations) {
    const changed = snapshotRows();
    mutate(changed);
    assert.notEqual(createSdkSchemaAuditSnapshot(changed).integrityDigest, first.integrityDigest);
  }
  assert.match(canonicalSdkAuditDigest({ b: 2, a: 1 }), /^[a-f0-9]{64}$/);
});

test("schema mismatch is fail-closed and never auto-migrates", () => {
  assert.throws(() => createSdkSchemaAuditSnapshot({ ...snapshotRows(), schemaVersion: 7 }), /SDK_SCHEMA_AUDIT_VERSION_MISMATCH/);
  assert.throws(() => createSdkSchemaAuditSnapshot({ ...snapshotRows(), schemaVersion: 9 }), /SDK_SCHEMA_AUDIT_VERSION_MISMATCH/);
});

test("schema loader uses one read-only repeatable-read transaction with exactly three SELECTs and injected clock", async () => {
  const statements: string[] = [];
  let options: unknown;
  const rows = [[{ version: 10 }], snapshotRows().games, snapshotRows().currentReleases];
  const sql = {
    transaction: async (callback: (tx: unknown) => Array<Promise<unknown>>, transactionOptions: unknown) => {
      options = transactionOptions;
      let index = 0;
      const tx = (strings: TemplateStringsArray) => {
        statements.push(strings.join("?"));
        return Promise.resolve(rows[index++]);
      };
      return Promise.all(callback(tx));
    },
  } as unknown as NonNullable<Parameters<typeof loadSdkSchemaAuditSnapshot>[1]>["sql"];
  const snapshot = await loadSdkSchemaAuditSnapshot("development", {
    sql,
    clock: () => new Date("2026-08-01T01:02:03.000Z"),
  });
  assert.equal(snapshot.observedAt, "2026-08-01T01:02:03.000Z");
  assert.deepEqual(options, { isolationLevel: "RepeatableRead", readOnly: true });
  assert.equal(statements.length, 3);
  assert.equal(statements.every((statement) => /^\s*SELECT\b/i.test(statement)), true);
  assert.equal(statements[2]?.includes("ORDER BY decided_at DESC, id DESC"), true);
  assert.equal(statements.some((statement) => /\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(statement)), false);
});

test("schema loader propagates query failure without returning an absent snapshot", async () => {
  const sql = {
    transaction: async (callback: (tx: unknown) => Array<Promise<unknown>>) => {
      let index = 0;
      const tx = () => index++ === 1
        ? Promise.reject(new Error("query-failed"))
        : Promise.resolve(index === 1 ? [{ version: 10 }] : []);
      return Promise.all(callback(tx));
    },
  } as unknown as NonNullable<Parameters<typeof loadSdkSchemaAuditSnapshot>[1]>["sql"];
  await assert.rejects(loadSdkSchemaAuditSnapshot("development", { sql }), /query-failed/);
});

test("schema loader propagates transaction failure without partial fallback", async () => {
  const sql = {
    transaction: async () => { throw new Error("transaction-failed"); },
  } as unknown as NonNullable<Parameters<typeof loadSdkSchemaAuditSnapshot>[1]>["sql"];
  await assert.rejects(loadSdkSchemaAuditSnapshot("development", { sql }), /transaction-failed/);
});

test("admin audit proxy authenticates before downstream and sets no-store on every response", async () => {
  for (const [message, status] of [["SITE_ADMIN_AUTH_REQUIRED", 401], ["SITE_ADMIN_FULL_AUTH_REQUIRED", 403]] as const) {
    let fetchCount = 0;
    const response = await proxySiteAdminSdkAuditGet({
      request: new Request("https://platform.example/api/admin/sdk-audit/schema-snapshot"),
      kind: "schema-snapshot",
      authorize: async () => { throw new Error(message); },
      portalBaseUrl: "https://portal.example",
      serviceHeaders: () => ({ "X-Game-Fields-SDK-Service": "signed" }),
      fetchRuntime: async () => { fetchCount += 1; return Response.json({}); },
    });
    assert.equal(response.status, status);
    assert.equal(fetchCount, 0);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }

  let target = "";
  const ok = await proxySiteAdminSdkAuditGet({
    request: new Request(`https://platform.example/api/admin/sdk-audit/runtime-manifest?gameId=sample-game&revision=${revision}`),
    kind: "runtime-manifest",
    authorize: async () => undefined,
    portalBaseUrl: "https://portal.example",
    serviceHeaders: (_method, url) => {
      assert.equal(url.includes("signed"), false);
      return { "X-Game-Fields-SDK-Service": "signed" };
    },
    fetchRuntime: async (url, init) => {
      target = String(url);
      assert.equal(init?.body, undefined);
      assert.equal((init?.headers as Record<string, string>)["X-Game-Fields-SDK-Service"], "signed");
      return Response.json({ gameId: "sample-game", requestedRevision: revision });
    },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "private, no-store");
  assert.equal(target, `https://portal.example/api/internal/audit/runtime-manifest?gameId=sample-game&revision=${revision}`);

  const unavailable = await proxySiteAdminSdkAuditGet({
    request: new Request("https://platform.example/api/admin/sdk-audit/schema-snapshot"),
    kind: "schema-snapshot",
    authorize: async () => { throw new Error("SITE_ADMIN_PASSWORD_NOT_CONFIGURED"); },
    portalBaseUrl: "https://portal.example",
    serviceHeaders: () => ({}),
    fetchRuntime: async () => Response.json({}),
  });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("cache-control"), "private, no-store");
});

test("full site-admin GET authentication is cookie-read-only", () => {
  const source = readFileSync("lib/site-admin-auth.ts", "utf8");
  const getStart = source.indexOf("export async function getSiteAdminSession");
  const getEnd = source.indexOf("export async function hasSiteAdminSession");
  const requireStart = source.indexOf("export async function requireSiteAdminSession");
  const requireEnd = source.indexOf("export async function requireRecentSiteAdminMfa");
  const chain = `${source.slice(getStart, getEnd)}\n${source.slice(requireStart, requireEnd)}`;
  assert.match(chain, /store\.get\(siteAdminCookieName\)/);
  assert.match(chain, /parseSiteAdminToken/);
  assert.doesNotMatch(chain, /store\.set|refresh|touch|last.?seen|INSERT|UPDATE|redis/i);
  const proxy = readFileSync("lib/site-admin-sdk-audit-proxy.ts", "utf8");
  assert.doesNotMatch(proxy, /telemetry|auditLog|cookie|INSERT|UPDATE|redis/i);
});

test("admin audit proxy rejects extra, duplicate and mutable query values before downstream", async () => {
  const urls = [
    "https://platform.example/api/admin/sdk-audit/schema-snapshot?environment=production",
    `https://platform.example/api/admin/sdk-audit/runtime-manifest?gameId=sample-game&revision=${revision}&revision=${revision}`,
    "https://platform.example/api/admin/sdk-audit/runtime-manifest?gameId=sample-game&revision=latest",
    "https://platform.example/api/admin/sdk-audit/runtime-manifest?gameId=../secret&revision=main",
  ];
  for (const url of urls) {
    let fetchCount = 0;
    const response = await proxySiteAdminSdkAuditGet({
      request: new Request(url),
      kind: url.includes("schema-snapshot") ? "schema-snapshot" : "runtime-manifest",
      authorize: async () => undefined,
      portalBaseUrl: "https://portal.example",
      serviceHeaders: () => ({}),
      fetchRuntime: async () => { fetchCount += 1; return Response.json({}); },
    });
    assert.equal(response.status, 400);
    assert.equal(fetchCount, 0);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

function runtimeFiles() {
  const server = Buffer.from("globalThis.GameFieldsServerBundle={};");
  const appSet = Buffer.from("export const appSet = {};\n");
  const manifest = {
    schemaVersion: 1,
    gameId: "sample-game",
    sdkPackageVersion: "0.1.1",
    sdkContractVersion: 1,
    manifest: { sdkVersion: 1, id: "sample-game", title: { ja: "例", en: "Example" } },
    client: { entry: "index.html" },
    server: {
      entry: "server.bundle.js",
      bundleSha256: sha(server.toString()),
      appSetSource: "source/app-set.ts",
      appSetSourceSha256: sha(appSet.toString()),
    },
  };
  return new Map<string, Uint8Array>([
    ["game-fields-package.json", Buffer.from(`${JSON.stringify(manifest)}\n`)],
    ["index.html", Buffer.from("<!doctype html><title>sample</title>")],
    ["server.bundle.js", server],
    ["source/app-set.ts", appSet],
    ["source/manifest.ts", Buffer.from("export const manifest = {};\n")],
    ["source/server-module.ts", Buffer.from("export const module = {};\n")],
    ["assets/extra.txt", Buffer.from("included in the package root\n")],
  ]);
}

function runtimeReader(files = runtimeFiles(), resolvedCommit = revision) {
  const trace: string[] = [];
  const prefix = "packages/creator-lab/sample-game/bundle/";
  const blobs = new Map([...files].map(([path, bytes]) => [sha(path), bytes]));
  const reader: RuntimeArtifactReader = {
    async readCommit(requested) {
      trace.push(`read-commit:${requested}`);
      return { commitSha: resolvedCommit, treeSha: "tree" };
    },
    async readTree(treeSha) {
      trace.push(`read-tree:${treeSha}`);
      return [...files].map(([path, bytes]) => ({ path: `${prefix}${path}`, type: "blob" as const, sha: sha(path), bytes: bytes.byteLength }));
    },
    async readBlob(blobSha) {
      trace.push(`read-blob:${blobSha}`);
      return blobs.get(blobSha) ?? null;
    },
  };
  return { reader, trace };
}

test("execution and audit share the same exact commit/tree/blob resolver and full package root", async () => {
  const executionSource = runtimeReader();
  const execution = await resolveRuntimeExecutionArtifact({
    locator: { instanceId: "creator-lab", gameId: "sample-game", revision },
    expectedServerBundleSha256: sha("globalThis.GameFieldsServerBundle={};"),
    reader: executionSource.reader,
  });
  const auditSource = runtimeReader();
  const audit = await resolveRuntimeArtifactAudit({
    locator: { instanceId: "creator-lab", gameId: "sample-game", revision },
    expected: {
      packageRootSha256: execution.packageRootSha256,
      serverBundleSha256: execution.serverBundleSha256,
      appSetSourceSha256: execution.appSetSourceSha256,
      manifest: execution.manifest,
    },
    reader: auditSource.reader,
  });
  assert.equal(audit.resolvedArtifactCommit, revision);
  assert.deepEqual(auditSource.trace, executionSource.trace);
  assert.equal(audit.packageRootSha256, gameFieldsPackageRootSha256([...runtimeFiles()].map(([path, content]) => ({ path, content }))));

  const changedFiles = runtimeFiles();
  changedFiles.set("assets/extra.txt", Buffer.from("changed"));
  const changed = await resolveRuntimeExecutionArtifact({
    locator: { instanceId: "creator-lab", gameId: "sample-game", revision },
    reader: runtimeReader(changedFiles).reader,
  });
  assert.notEqual(changed.packageRootSha256, execution.packageRootSha256);
  assert.equal(changed.serverBundleSha256, execution.serverBundleSha256);
});

test("full-tree resolver stays Portal-audit-only while Preview runner single-fetches and verifies the granted bundle", () => {
  const portalReader = readFileSync("apps/sdk-portal/lib/mock-git-store.ts", "utf8");
  const portalAudit = readFileSync("apps/sdk-portal/lib/runtime-manifest-audit.ts", "utf8");
  const previewSource = readFileSync("apps/sdk-preview/lib/preview-source.ts", "utf8");
  const previewCache = readFileSync("apps/sdk-preview/lib/runtime-artifact-cache.ts", "utf8");
  const previewRoute = readFileSync("apps/sdk-preview/app/server/[instanceId]/[gameId]/[revision]/route.ts", "utf8");
  assert.match(portalReader, /createGamePackageRuntimeReader/);
  assert.match(portalReader, /recursive=1/);
  assert.match(portalAudit, /resolveRuntimeExecutionArtifact/);
  assert.doesNotMatch(previewSource, /createPreviewRuntimeArtifactReader|resolveRuntimeExecutionArtifact|recursive=1|\/git\/trees\/|\/git\/blobs\//);
  assert.doesNotMatch(previewRoute, /createPreviewRuntimeArtifactReader|resolveRuntimeExecutionArtifact|recursive=1|\/git\/trees\/|\/git\/blobs\//);
  assert.equal((previewRoute.match(/fetchPreviewAsset\s*\(/g) ?? []).length, 1);
  assert.match(previewRoute, /assetPath:\s*"server\.bundle\.js"/);
  assert.match(previewRoute, /expectedBundleSha256 = grant\.bundleSha256/);
  assert.match(previewRoute, /sdkPreviewRuntimeArtifactCache\.resolve/);
  assert.match(previewCache, /createHash\("sha256"\)/);
  assert.match(previewCache, /serverBundleSha256/);
  assert.match(previewRoute, /runGameSdkPortableServer/);
  assert.match(previewRoute, /runGameSdkPortableCommandBatch/);
  assert.match(previewRoute, /createGameSdkCommandTimingCollector/);
  assert.match(previewRoute, /runner-bundle/);
  assert.match(previewRoute, /runner-hash/);
});

test("exact runtime resolver rejects mutable refs, commit mismatch, missing paths, invalid manifest and each hash mismatch", async () => {
  for (const mutable of ["main", "latest", "A".repeat(40), "../secret"] as const) {
    await assert.rejects(resolveRuntimeExecutionArtifact({
      locator: { instanceId: "creator-lab", gameId: "sample-game", revision: mutable },
      reader: runtimeReader().reader,
    }), (error: unknown) => error instanceof RuntimeArtifactError && error.code === "REVISION_INVALID");
  }
  await assert.rejects(resolveRuntimeExecutionArtifact({
    locator: { instanceId: "creator-lab", gameId: "sample-game", revision },
    reader: runtimeReader(runtimeFiles(), "b".repeat(40)).reader,
  }), (error: unknown) => error instanceof RuntimeArtifactError && error.code === "COMMIT_MISMATCH");

  const missing = runtimeFiles();
  missing.delete("server.bundle.js");
  await assert.rejects(resolveRuntimeExecutionArtifact({
    locator: { instanceId: "creator-lab", gameId: "sample-game", revision },
    reader: runtimeReader(missing).reader,
  }), (error: unknown) => error instanceof RuntimeArtifactError && error.code === "PATH_NOT_FOUND");

  const invalid = runtimeFiles();
  invalid.set("game-fields-package.json", Buffer.from("not-json"));
  await assert.rejects(resolveRuntimeExecutionArtifact({
    locator: { instanceId: "creator-lab", gameId: "sample-game", revision },
    reader: runtimeReader(invalid).reader,
  }), (error: unknown) => error instanceof RuntimeArtifactError && error.code === "MANIFEST_INVALID");

  const artifact = await resolveRuntimeExecutionArtifact({
    locator: { instanceId: "creator-lab", gameId: "sample-game", revision },
    reader: runtimeReader().reader,
  });
  for (const [field, code] of [
    ["packageRootSha256", "PACKAGE_ROOT_HASH_MISMATCH"],
    ["serverBundleSha256", "SERVER_BUNDLE_HASH_MISMATCH"],
    ["appSetSourceSha256", "APP_SET_HASH_MISMATCH"],
  ] as const) {
    await assert.rejects(resolveRuntimeArtifactAudit({
      locator: { instanceId: "creator-lab", gameId: "sample-game", revision },
      expected: { ...artifact, [field]: "0".repeat(64) },
      reader: runtimeReader().reader,
    }), (error: unknown) => error instanceof RuntimeArtifactError && error.code === code);
  }
  await assert.rejects(resolveRuntimeArtifactAudit({
    locator: { instanceId: "creator-lab", gameId: "sample-game", revision },
    expected: { ...artifact, manifest: { sdkVersion: 99, id: "sample-game" } },
    reader: runtimeReader().reader,
  }), (error: unknown) => error instanceof RuntimeArtifactError && error.code === "MANIFEST_HASH_MISMATCH");
});

test("audit route source is fixed GET/read-only and omits credentials, PII and mutations", () => {
  const platform = [
    "app/api/admin/sdk-audit/schema-snapshot/route.ts",
    "app/api/admin/sdk-audit/runtime-manifest/route.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  const platformProxy = readFileSync("lib/site-admin-sdk-audit-proxy.ts", "utf8");
  const portal = [
    "apps/sdk-portal/app/api/internal/audit/schema-snapshot/route.ts",
    "apps/sdk-portal/app/api/internal/audit/runtime-manifest/route.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.match(platform, /requireFullSiteAdminSession/);
  assert.match(platformProxy, /private, no-store/);
  assert.match(portal, /requireSdkServiceRequest/);
  assert.match(portal, /private, no-store/);
  assert.doesNotMatch(`${platform}\n${portal}`, /\b(?:INSERT|UPDATE|DELETE|SET|compile|createRoom|upload)\b/i);
  assert.doesNotMatch(`${platform}\n${portal}`, /cookie|connectionString|actorRef|decisionReason|signedUrl/i);
  const runtimeAudit = readFileSync("apps/sdk-portal/lib/runtime-manifest-audit.ts", "utf8");
  assert.match(runtimeAudit, /revision: String\(row\.revision\)/);
  assert.doesNotMatch(runtimeAudit, /revision: String\(row\.sourceRevision\)/);
});
