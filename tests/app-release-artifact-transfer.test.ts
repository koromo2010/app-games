import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  parseGameFieldsPackageManifest,
} from "../apps/sdk-portal/lib/game-package-manifest.ts";
import {
  GamePackageGitTargetError,
  prepareGamePackageUploadFiles,
  probeGamePackageGitWriteTarget,
  type MockUploadFile,
  type PreparedUploadFile,
} from "../apps/sdk-portal/lib/mock-git-store.ts";

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

const {
  AppReleaseArtifactTransferError,
  probeDevelopmentPackageArtifactSource,
  transferDevelopmentPackageArtifact,
} = await import("../apps/sdk-portal/lib/app-release-artifact-transfer.ts");

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function packageFixture() {
  const serverBundle = "globalThis.GameFieldsServerBundle={};";
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
    client: { entry: "index.html" },
    server: {
      entry: "server.bundle.js",
      bundleSha256: sha256(serverBundle),
      appSetSource: "source/app-set.ts",
      appSetSourceSha256: sha256(appSetSource),
    },
  };
  const files: MockUploadFile[] = [
    {
      path: "game-fields-package.json",
      content: `${JSON.stringify(manifest)}\n`,
      encoding: "utf-8",
    },
    {
      path: "index.html",
      content: "<!doctype html><title>fixture</title>",
      encoding: "utf-8",
    },
    {
      path: "server.bundle.js",
      content: serverBundle,
      encoding: "utf-8",
    },
    {
      path: "source/app-set.ts",
      content: appSetSource,
      encoding: "utf-8",
    },
    {
      path: "source/manifest.ts",
      content: "export const manifest = {};\n",
      encoding: "utf-8",
    },
    {
      path: "source/server-module.ts",
      content: "export const serverModule = {};\n",
      encoding: "utf-8",
    },
  ];
  const prepared = prepareGamePackageUploadFiles(files);
  const parsed = parseGameFieldsPackageManifest({
    gameId: "portable-fixture",
    files: prepared,
  });
  return { files: prepared, parsed };
}

function artifactFetch(files: readonly PreparedUploadFile[], revision: string) {
  return (async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const path = url.searchParams.get("path");
    if (!path) {
      return Response.json({
        revision,
        files: files.map((file) => ({ path: file.path, bytes: file.bytes })),
      });
    }
    const file = files.find((item) => item.path === path);
    if (!file) return Response.json({ error: "not_found" }, { status: 404 });
    const bytes = file.encoding === "base64"
      ? Buffer.from(file.content, "base64")
      : Buffer.from(file.content, "utf8");
    return new Response(bytes);
  }) as typeof fetch;
}

test("dev to main promotion copies and verifies an immutable package artifact", async () => {
  const sourceRevision = "a".repeat(40);
  const targetRevision = "b".repeat(40);
  const { files, parsed } = packageFixture();
  let saved: PreparedUploadFile[] | null = null;
  const result = await transferDevelopmentPackageArtifact({
    sourceCreatorSlug: "moi-lab",
    sourceGameId: "portable-fixture",
    revision: sourceRevision,
    packageRootSha256: parsed.packageRootSha256,
    serverBundleSha256: parsed.bundleSha256,
    appSetSourceSha256: parsed.appSetSourceSha256,
    manifest: parsed.manifest.manifest,
  }, {
    fetchRuntime: artifactFetch(files, sourceRevision),
    saveFiles: async (input) => {
      saved = prepareGamePackageUploadFiles(input.files);
      return targetRevision;
    },
    env: { SDK_DEVELOPMENT_INTERNAL_URL: "https://sdk-dev.example.test" },
  });

  assert.equal(result.sourceRevision, sourceRevision);
  assert.equal(result.revision, targetRevision);
  assert.equal(result.packageRootSha256, parsed.packageRootSha256);
  assert.deepEqual(
    saved?.map((file) => [file.path, file.bytes]),
    files.map((file) => [file.path, file.bytes]),
  );
});

test("main can probe the authenticated development artifact source", async () => {
  let signedUrl = "";
  await probeDevelopmentPackageArtifactSource({
    fetchRuntime: (async (input: string | URL | Request) => {
      signedUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      return Response.json({ status: "ok", channel: "development" });
    }) as typeof fetch,
    serviceHeaders: (_method, url) => {
      assert.equal(url, "https://sdk-dev.example.test/api/internal/package-artifacts");
      return { "X-Test-Service": "signed" };
    },
    env: { SDK_DEVELOPMENT_INTERNAL_URL: "https://sdk-dev.example.test/" },
  });
  assert.equal(
    signedUrl,
    "https://sdk-dev.example.test/api/internal/package-artifacts",
  );
});

test("main target probe verifies repository identity and push permission", async () => {
  let authorization = "";
  await probeGamePackageGitWriteTarget({
    fetchRuntime: (async (_input, init) => {
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return Response.json({
        full_name: "koromo2010/game-fields-sdk-mocks",
        permissions: { push: true },
      });
    }) as typeof fetch,
    env: {
      SDK_MOCK_GITHUB_REPOSITORY: "koromo2010/game-fields-sdk-mocks",
      SDK_MOCK_GITHUB_WRITE_TOKEN: "test-secret",
    },
  });
  assert.equal(authorization, "Bearer test-secret");
});

test("main target probe reports inaccessible repository without exposing credentials", async () => {
  await assert.rejects(
    probeGamePackageGitWriteTarget({
      fetchRuntime: (async () => Response.json(
        { message: "Not Found" },
        { status: 404 },
      )) as typeof fetch,
      env: {
        SDK_MOCK_GITHUB_REPOSITORY: "koromo2010/game-fields-sdk-mocks",
        SDK_MOCK_GITHUB_WRITE_TOKEN: "test-secret",
      },
    }),
    (error) => (
      error instanceof GamePackageGitTargetError
      && error.code === "SDK_PACKAGE_GIT_REPOSITORY_NOT_ACCESSIBLE_REPOSITORY"
      && !error.message.includes("test-secret")
    ),
  );
});

test("dev to main promotion rejects changed artifacts before target Git write", async () => {
  const sourceRevision = "c".repeat(40);
  const { files, parsed } = packageFixture();
  let writes = 0;
  await assert.rejects(
    transferDevelopmentPackageArtifact({
      sourceCreatorSlug: "moi-lab",
      sourceGameId: "portable-fixture",
      revision: sourceRevision,
      packageRootSha256: "0".repeat(64),
      serverBundleSha256: parsed.bundleSha256,
      appSetSourceSha256: parsed.appSetSourceSha256,
      manifest: parsed.manifest.manifest,
    }, {
      fetchRuntime: artifactFetch(files, sourceRevision),
      saveFiles: async () => {
        writes += 1;
        return "d".repeat(40);
      },
    }),
    (error) => (
      error instanceof AppReleaseArtifactTransferError
      && error.code === "APP_RELEASE_ARTIFACT_HASH_MISMATCH"
    ),
  );
  assert.equal(writes, 0);
});
