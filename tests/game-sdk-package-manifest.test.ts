import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  parseGameFieldsPackageManifest,
} from "../apps/sdk-portal/lib/game-package-manifest.ts";
import type {
  PreparedUploadFile,
} from "../apps/sdk-portal/lib/mock-git-store.ts";

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function packageFiles(input?: {
  declaredBundleHash?: string;
  declaredAppSetHash?: string;
  clientEntry?: string;
  serverBundle?: string;
}): PreparedUploadFile[] {
  const serverBundle = input?.serverBundle
    ?? "globalThis.GameFieldsServerBundle={};";
  const appSetSource = "export const appSet = {};\n";
  const manifest = {
    schemaVersion: 1,
    gameId: "portable-fixture",
    sdkPackageVersion: "0.1.1",
    sdkContractVersion: 1,
    manifest: {
      sdkVersion: 1,
      id: "portable-fixture",
      title: { ja: "fixture", en: "Fixture" },
      playMode: "online-room",
      minimumPlayers: 1,
      maximumPlayers: 4,
      supportsDebug: true,
      supportsSpectators: false,
      supportsReplay: false,
      supportsRating: false,
      usesLlm: false,
      settings: [{
        key: "timeLimitSeconds",
        label: { ja: "制限時間", en: "Time limit" },
        type: "select",
        defaultValue: 60,
        platformRole: "time-limit",
        options: [0, 60],
      }],
    },
    client: { entry: input?.clientEntry ?? "index.html" },
    server: {
      entry: "server.bundle.js",
      bundleSha256: input?.declaredBundleHash ?? sha256(serverBundle),
      appSetSource: "source/app-set.ts",
      appSetSourceSha256: input?.declaredAppSetHash ?? sha256(appSetSource),
    },
  };
  const values = new Map<string, string>([
    ["game-fields-package.json", `${JSON.stringify(manifest)}\n`],
    ["index.html", "<!doctype html><title>fixture</title>"],
    ["server.bundle.js", serverBundle],
    ["source/app-set.ts", appSetSource],
    ["source/manifest.ts", "export const manifest = {};\n"],
    ["source/server-module.ts", "export const module = {};\n"],
  ]);
  return [...values].map(([path, content]) => ({
    path,
    content,
    encoding: "utf-8" as const,
    bytes: Buffer.byteLength(content),
  }));
}

test("game package accepts only hashes recomputed from its immutable files", () => {
  const parsed = parseGameFieldsPackageManifest({
    gameId: "portable-fixture",
    files: packageFiles(),
  });
  assert.equal(parsed.manifest.gameId, "portable-fixture");
  assert.match(parsed.bundleSha256, /^[a-f0-9]{64}$/);
  assert.match(parsed.appSetSourceSha256, /^[a-f0-9]{64}$/);
});

test("game package rejects changed server bundle or AppSet source", () => {
  assert.throws(() => parseGameFieldsPackageManifest({
    gameId: "portable-fixture",
    files: packageFiles({ declaredBundleHash: "0".repeat(64) }),
  }), /GAME_SDK_PACKAGE_SERVER_HASH_MISMATCH/);
  assert.throws(() => parseGameFieldsPackageManifest({
    gameId: "portable-fixture",
    files: packageFiles({ declaredAppSetHash: "0".repeat(64) }),
  }), /GAME_SDK_PACKAGE_APP_SET_HASH_MISMATCH/);
});

test("game package rejects browser entrypoints and bundles outside the portable contract", () => {
  assert.throws(() => parseGameFieldsPackageManifest({
    gameId: "portable-fixture",
    files: packageFiles({ clientEntry: "server.bundle.js" }),
  }), /GAME_SDK_PACKAGE_MANIFEST_INVALID/);
  assert.throws(() => parseGameFieldsPackageManifest({
    gameId: "portable-fixture",
    files: packageFiles({ serverBundle: "x".repeat(1024 * 1024 + 1) }),
  }), /GAME_SDK_PACKAGE_SERVER_BUNDLE_TOO_LARGE/);
});
