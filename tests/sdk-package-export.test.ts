import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildGamePackageExport } from "../apps/sdk-portal/lib/game-package-export.ts";
import { prepareOwnedGamePackageExport } from "../apps/sdk-portal/lib/owned-game-package-export.ts";
import { prepareOperatorPackageExport } from "../apps/sdk-portal/lib/operator-package-export.ts";
import type { RuntimeArtifactReader } from "@game-fields/sdk-runtime-artifact";

const revision = "a".repeat(40);
const prefix = "packages/test-owner/test-game/bundle/";
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

function fixture(overrides: Record<string, string | null> = {}) {
  const appSet = overrides["source/app-set.ts"] ?? "export const appSet = {};\n";
  const server = overrides["server.bundle.js"] ?? "export default {};\n";
  assert.equal(typeof appSet, "string");
  assert.equal(typeof server, "string");
  const manifest = JSON.stringify({
    schemaVersion: 1,
    gameId: "test-game",
    sdkPackageVersion: "0.2.0",
    sdkContractVersion: 1,
    manifest: { sdkVersion: 1, id: "test-game" },
    client: { entry: "index.html" },
    server: { entry: "server.bundle.js", bundleSha256: hash(server), appSetSource: "source/app-set.ts", appSetSourceSha256: hash(appSet) },
  });
  const values: Record<string, string> = { "game-fields-package.json": manifest, "index.html": "<!doctype html><title>game</title>", "server.bundle.js": server, "source/app-set.ts": appSet, "source/manifest.ts": "export {};", "source/server-module.ts": "export {};" };
  for (const [path, value] of Object.entries(overrides)) {
    if (value === null) delete values[path];
    else values[path] = value;
  }
  const blobs = new Map(Object.entries(values).map(([path, value]) => [`blob-${path}`, Buffer.from(value)]));
  const reader: RuntimeArtifactReader = {
    readCommit: async () => ({ commitSha: revision, treeSha: "tree" }),
    readTree: async () => Object.keys(values).map((path) => ({ path: `${prefix}${path}`, type: "blob" as const, sha: `blob-${path}`, bytes: Buffer.byteLength(values[path]!), mode: "100644" })),
    readBlob: async (sha) => blobs.get(sha) ?? null,
  };
  return reader;
}

const metadata = {
  creatorSlug: "test-owner", gameId: "test-game", revision,
  createdAt: "2026-08-05T00:00:00.000Z", packageRootSha256: null,
  serverBundleSha256: null, appSetSourceSha256: null,
  sdkPackageVersion: "0.2.0", sdkContractVersion: 1,
};

test("owner export builds a runtime-package archive with stable package checksums", async () => {
  const first = await buildGamePackageExport({ metadata, reader: fixture(), exportedAt: "2026-08-05T01:00:00.000Z" });
  const second = await buildGamePackageExport({ metadata, reader: fixture(), exportedAt: "2026-08-05T02:00:00.000Z" });
  assert.equal(first.manifest.contract.sourceCompleteness, "runtime-package");
  assert.equal(first.manifest.files.count, 6);
  assert.deepEqual(first.manifest.limitations.length, 2);
  assert.equal(first.checksums, second.checksums);
  assert.equal(first.archive.subarray(0, 4).toString("hex"), "504b0304");
  assert.match(first.archive.toString("utf8"), /checksums\.sha256/);
  assert.match(first.archive.toString("utf8"), /excluded-files\.json/);
});

test("owner export refuses secret candidates", async () => {
  await assert.rejects(
    buildGamePackageExport({ metadata, reader: fixture({ "notes.txt": "DATABASE_URL=postgres://secret" }) }),
    /SDK_PACKAGE_EXPORT_SECRET_DETECTED/,
  );
  await assert.rejects(
    buildGamePackageExport({ metadata, reader: fixture({ "notes.txt": "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE" }) }),
    /SDK_PACKAGE_EXPORT_SECRET_DETECTED/,
  );
});

test("owner export refuses non-allowlisted files, unsafe paths, and symlinks", async () => {
  await assert.rejects(buildGamePackageExport({ metadata, reader: fixture({ ".env": "harmless" }) }), /FILE_TYPE_FORBIDDEN/);
  await assert.rejects(buildGamePackageExport({ metadata, reader: fixture({ "../escape.js": "safe" }) }), /TREE_INVALID/);
  await assert.rejects(buildGamePackageExport({ metadata, reader: fixture({ "/absolute.js": "safe" }) }), /TREE_INVALID/);
  await assert.rejects(buildGamePackageExport({ metadata, reader: fixture({ "nul\0.js": "safe" }) }), /ZIP_PATH_INVALID/);
  const reader = fixture();
  const originalReadTree = reader.readTree;
  reader.readTree = async (sha) => (await originalReadTree(sha))?.map((entry, index) => index === 0 ? { ...entry, mode: "120000" } : entry) ?? null;
  await assert.rejects(buildGamePackageExport({ metadata, reader }), /SDK_RUNTIME_ARTIFACT_TREE_INVALID/);
});

test("owner export refuses missing required files and package identity mismatches", async () => {
  await assert.rejects(
    buildGamePackageExport({ metadata, reader: fixture({ "server.bundle.js": null }) }),
    /PATH_NOT_FOUND/,
  );
  const mismatchedManifest = JSON.stringify({
    schemaVersion: 1,
    gameId: "other-game",
    sdkPackageVersion: "0.2.0",
    sdkContractVersion: 1,
    manifest: { sdkVersion: 1, id: "other-game" },
    client: { entry: "index.html" },
    server: { entry: "server.bundle.js", bundleSha256: "0".repeat(64), appSetSource: "source/app-set.ts", appSetSourceSha256: "0".repeat(64) },
  });
  await assert.rejects(
    buildGamePackageExport({ metadata, reader: fixture({ "game-fields-package.json": mismatchedManifest }) }),
    /MANIFEST_INVALID/,
  );
});

test("owner export refuses file and total size violations", async () => {
  await assert.rejects(
    buildGamePackageExport({ metadata, reader: fixture({ "large.js": "x".repeat(2 * 1024 * 1024 + 1) }) }),
    /TREE_INVALID|FILE_TOO_LARGE/,
  );
  await assert.rejects(
    buildGamePackageExport({ metadata, reader: fixture({
      "large-a.js": "a".repeat(1_800_000),
      "large-b.js": "b".repeat(1_800_000),
      "large-c.js": "c".repeat(1_800_000),
    }) }),
    /PACKAGE_TOO_LARGE/,
  );
});

test("owner export reads only the fixed game package prefix", async () => {
  const reader = fixture();
  const readTree = reader.readTree;
  reader.readTree = async (treeSha) => [
    ...(await readTree(treeSha)) ?? [],
    { path: "packages/other-owner/other-game/bundle/secret.js", type: "blob", sha: "outside", bytes: 10, mode: "100644" },
  ];
  const result = await buildGamePackageExport({ metadata, reader });
  assert.equal(result.manifest.files.count, 6);
  assert.doesNotMatch(result.checksums, /secret\.js/);
});

test("owner authorization binds session owner, creator, game, and revision", async () => {
  const calls: Array<{ ownerPlayerId: string; creatorSlug: string; gameId: string }> = [];
  const listRevisions = async (input: { ownerPlayerId: string; creatorSlug: string; gameId: string }) => {
    calls.push(input);
    if (input.ownerPlayerId !== "owner-1" || input.creatorSlug !== "test-owner" || input.gameId !== "test-game") return [];
    return [{ ...metadata, channel: "development" as const }];
  };
  const dependencies = { listRevisions, reader: fixture() };
  assert.deepEqual(await prepareOwnedGamePackageExport({ ownerPlayerId: null, creatorSlug: "test-owner", gameId: "test-game", revision }, dependencies), { status: "unauthenticated" });
  assert.deepEqual(await prepareOwnedGamePackageExport({ ownerPlayerId: "owner-2", creatorSlug: "test-owner", gameId: "test-game", revision }, dependencies), { status: "not_found" });
  assert.deepEqual(await prepareOwnedGamePackageExport({ ownerPlayerId: "owner-1", creatorSlug: "other-owner", gameId: "test-game", revision }, dependencies), { status: "not_found" });
  assert.deepEqual(await prepareOwnedGamePackageExport({ ownerPlayerId: "owner-1", creatorSlug: "test-owner", gameId: "other-game", revision }, dependencies), { status: "not_found" });
  assert.deepEqual(await prepareOwnedGamePackageExport({ ownerPlayerId: "owner-1", creatorSlug: "test-owner", gameId: "test-game", revision: "b".repeat(40) }, dependencies), { status: "not_found" });
  const success = await prepareOwnedGamePackageExport({ ownerPlayerId: "owner-1", creatorSlug: "test-owner", gameId: "test-game", revision }, dependencies);
  assert.equal(success.status, "ok");
  assert.deepEqual(calls.at(-1), { ownerPlayerId: "owner-1", creatorSlug: "test-owner", gameId: "test-game" });
});

test("a management token without an account session cannot export", async () => {
  let listCalled = false;
  const result = await prepareOwnedGamePackageExport(
    { ownerPlayerId: null, creatorSlug: "test-owner", gameId: "test-game", revision },
    { listRevisions: async () => { listCalled = true; return [{ ...metadata, channel: null }]; }, reader: fixture() },
  );
  assert.deepEqual(result, { status: "unauthenticated" });
  assert.equal(listCalled, false);
});

test("an authorized owner receives unavailable when the artifact is missing", async () => {
  const reader = fixture();
  reader.readCommit = async () => null;
  const result = await prepareOwnedGamePackageExport(
    { ownerPlayerId: "owner-1", creatorSlug: "test-owner", gameId: "test-game", revision },
    { listRevisions: async () => [{ ...metadata, channel: null }], reader },
  );
  assert.deepEqual(result, { status: "unavailable" });
});

test("operator export binds current main identity and all package hashes before building", async () => {
  const release = {
    id: "release-1",
    lineageId: "test-owner/test-game",
    publicGameId: "public-game",
    sourceCreatorSlug: "test-owner",
    sourceGameId: "test-game",
    sourceEnvironment: "development",
    title: "Test game",
    revision,
    sourceRevision: "b".repeat(40),
    packageRootSha256: null,
    serverBundleSha256: null,
    appSetSourceSha256: null,
    manifest: {},
    modulePolicy: {},
    releasedAt: "2026-08-05T00:00:00.000Z",
  } as const;
  const input = {
    publicGameId: release.publicGameId,
    lineageId: release.lineageId,
    revision,
    packageRootSha256: "1".repeat(64),
    serverBundleSha256: "2".repeat(64),
    appSetSourceSha256: "3".repeat(64),
  };
  const calls: unknown[] = [];
  const result = await prepareOperatorPackageExport(input, {
    findCurrent: async (value) => {
      calls.push(value);
      return release as never;
    },
    reader: fixture(),
    now: "2026-08-05T01:00:00.000Z",
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(calls, [input]);
  if (result.status === "ok") {
    assert.match(result.filename, /^public-game-aaaaaaaaaaaa-main-runtime-package\.zip$/);
  }
  const mismatched = await prepareOperatorPackageExport(
    { ...input, serverBundleSha256: "4".repeat(64) },
    { findCurrent: async () => undefined, reader: fixture() },
  );
  assert.deepEqual(mismatched, { status: "not_found" });
  const nonDevelopment = await prepareOperatorPackageExport(input, {
    findCurrent: async () => ({ ...release, sourceEnvironment: "production" } as never),
    reader: fixture(),
  });
  assert.deepEqual(nonDevelopment, { status: "not_found" });
});

test("route, owner query, and UI retain the secure download contract", () => {
  const route = readFileSync("apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/exports/[revision]/route.ts", "utf8");
  const registry = readFileSync("apps/sdk-portal/lib/instance-registry.ts", "utf8");
  const page = readFileSync("apps/sdk-portal/app/[instanceId]/games/[gameId]/GamePackageRevisionExport.tsx", "utf8");
  assert.match(route, /getSdkAccountSession/);
  assert.doesNotMatch(route, /managementToken|authorization/i);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /application\/zip/);
  assert.match(route, /private, no-store/);
  assert.match(registry, /c\.owner_player_id = \$\{input\.ownerPlayerId\}/);
  assert.match(registry, /c\.deleted_at IS NULL/);
  assert.match(registry, /g\.deleted_at IS NULL/);
  assert.match(page, /Runtime package/);
  assert.match(page, /完全な編集用ソースは保証されません/);
  assert.match(page, /検査済みパッケージを取得/);
});

test("operator export is read-only, main-bound, and never widens owner export", () => {
  const internal = readFileSync("apps/sdk-portal/app/api/internal/app-releases/export/route.ts", "utf8");
  const admin = readFileSync("app/api/admin/app-releases/export/route.ts", "utf8");
  const store = readFileSync("apps/sdk-portal/lib/app-release-store.ts", "utf8");
  const panel = readFileSync("app/admin/AppReleaseManagementPanel.tsx", "utf8");
  assert.match(internal, /requireSdkServiceRequest/);
  assert.match(internal, /VERCEL_GIT_COMMIT_REF !== "main"/);
  assert.match(internal, /findCurrentAppReleaseForExport/);
  assert.match(internal, /application\/zip/);
  assert.match(internal, /private, no-store/);
  assert.match(internal, /X-Content-Type-Options/);
  assert.match(admin, /requireRecentSiteAdminMfa/);
  assert.match(admin, /sdkServiceHeaders\("GET"/);
  assert.match(admin, /operator-package-export/);
  assert.match(store, /WHERE is_current/);
  assert.match(store, /package_root_sha256 = \$\{input\.packageRootSha256\}/);
  assert.match(store, /server_bundle_sha256 = \$\{input\.serverBundleSha256\}/);
  assert.match(store, /app_set_source_sha256 = \$\{input\.appSetSourceSha256\}/);
  assert.match(panel, /read-only operator export/);
  assert.match(panel, /検証用ZIPを取得/);
  assert.match(panel, /method: "POST"/);
});
