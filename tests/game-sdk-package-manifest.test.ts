import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as nodeModule from "node:module";
import test from "node:test";
import {
  isGamePackageReleaseSupported,
} from "../apps/sdk-portal/lib/game-package-store.ts";
import {
  parseGameFieldsPackageManifest,
} from "../apps/sdk-portal/lib/game-package-manifest.ts";
import type {
  PreparedUploadFile,
} from "../apps/sdk-portal/lib/mock-git-store.ts";
import {
  prepareGamePackageUploadFiles,
} from "../apps/sdk-portal/lib/mock-git-store.ts";
import { sdkPackageAssetFixture } from "./sdk-package-asset-fixtures.ts";

const registerHooks = (nodeModule as unknown as {
  registerHooks(options: {
    resolve(
      specifier: string,
      context: object,
      nextResolve: (specifier: string, context: object) => unknown,
    ): unknown;
  }): void;
}).registerHooks;

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        (error as { code?: string }).code === "ERR_MODULE_NOT_FOUND"
        && (specifier.startsWith("./") || specifier.startsWith("../"))
        && !/\.[cm]?[jt]sx?$/.test(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

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

test("publish accepts every SDK contract version advertised by the release", () => {
  const release = {
    sdkPackageVersion: "0.1.1",
    supportedSdkContractVersions: [1, 2],
  } as const;
  assert.equal(isGamePackageReleaseSupported({
    sdkPackageVersion: "0.1.1",
    sdkContractVersion: 1,
  }, release), true);
  assert.equal(isGamePackageReleaseSupported({
    sdkPackageVersion: "0.1.1",
    sdkContractVersion: 2,
  }, release), true);
});

test("publish rejects unsupported contracts and SDK package mismatches", () => {
  const release = {
    sdkPackageVersion: "0.1.1",
    supportedSdkContractVersions: [1, 2],
  } as const;
  assert.equal(isGamePackageReleaseSupported({
    sdkPackageVersion: "0.1.1",
    sdkContractVersion: 3,
  }, release), false);
  assert.equal(isGamePackageReleaseSupported({
    sdkPackageVersion: "0.1.0",
    sdkContractVersion: 1,
  }, release), false);
});

test("game package accepts only hashes recomputed from its immutable files", () => {
  const parsed = parseGameFieldsPackageManifest({
    gameId: "portable-fixture",
    files: packageFiles(),
  });
  assert.equal(parsed.manifest.gameId, "portable-fixture");
  assert.match(parsed.bundleSha256, /^[a-f0-9]{64}$/);
  assert.match(parsed.appSetSourceSha256, /^[a-f0-9]{64}$/);
  assert.match(parsed.packageRootSha256, /^[a-f0-9]{64}$/);
});

test("package root hash normalizes JSON key order, file order and LF", () => {
  const first = packageFiles();
  const second = [...first]
    .reverse()
    .map((file) => ({
      ...file,
      content: file.path.endsWith(".json")
        ? `${JSON.stringify(JSON.parse(file.content), null, 2)}\r\n`
        : ["source/manifest.ts", "source/server-module.ts"].includes(file.path)
          ? file.content.replaceAll("\n", "\r\n")
          : file.content,
    }));
  const left = parseGameFieldsPackageManifest({
    gameId: "portable-fixture",
    files: first,
  });
  const right = parseGameFieldsPackageManifest({
    gameId: "portable-fixture",
    files: second,
  });
  assert.equal(left.packageRootSha256, right.packageRootSha256);
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

test("game package upload accepts generated Markdown documentation", () => {
  const raw = packageFiles().map(({ path, content, encoding }) => ({
    path,
    content,
    encoding,
  }));
  const prepared = prepareGamePackageUploadFiles([
    ...raw,
    {
      path: "mock/README.md",
      content: "# Mock instructions\n",
      encoding: "utf-8",
    },
  ]);
  assert.equal(prepared.some((file) => file.path === "mock/README.md"), true);
});

test("Markdown package files are validated as UTF-8 text", () => {
  const raw = packageFiles().map(({ path, content, encoding }) => ({
    path,
    content,
    encoding,
  }));
  assert.throws(() => prepareGamePackageUploadFiles([
    ...raw,
    {
      path: "mock/README.md",
      content: Buffer.from("# encoded").toString("base64"),
      encoding: "base64",
    },
  ]), /SDK_UPLOAD_TEXT_ENCODING_INVALID/);
});

test("package inspection rejects active SVG and extension/MIME mismatches", () => {
  const typedFixture: PreparedUploadFile[] = sdkPackageAssetFixture();
  assert.equal(typedFixture.some((file) => file.path === "game-fields-package.json"), true);
  const raw = packageFiles().map(({ path, content, encoding }) => ({
    path,
    content,
    encoding,
  }));
  assert.throws(() => prepareGamePackageUploadFiles([
    ...raw,
    {
      path: "assets/active.svg",
      content: "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>",
      encoding: "utf-8",
    },
  ]), /SDK_UPLOAD_SVG_ACTIVE_CONTENT_FORBIDDEN/);
  assert.throws(() => prepareGamePackageUploadFiles([
    ...raw,
    {
      path: "assets/not-a-png.png",
      content: Buffer.from("plain text").toString("base64"),
      encoding: "base64",
    },
  ]), /SDK_UPLOAD_MIME_MISMATCH/);
});
