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
  saveGamePackageFilesToGit,
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
  const requests: string[] = [];
  await probeGamePackageGitWriteTarget({
    fetchRuntime: (async (input, init) => {
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      requests.push(url.pathname);
      if (url.pathname.endsWith("/git/ref/heads/sdk-previews")) {
        return Response.json({ object: { sha: "a".repeat(40) } });
      }
      return Response.json({
        default_branch: "main",
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
  assert.deepEqual(requests, [
    "/repos/koromo2010/game-fields-sdk-mocks",
    "/repos/koromo2010/game-fields-sdk-mocks/git/ref/heads/sdk-previews",
  ]);
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

test("main target probe reports an empty repository before package transfer", async () => {
  await assert.rejects(
    probeGamePackageGitWriteTarget({
      fetchRuntime: (async (input) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        if (url.pathname.endsWith("/git/ref/heads/sdk-previews")) {
          return Response.json(
            { message: "Git Repository is empty." },
            { status: 409 },
          );
        }
        return Response.json({
          default_branch: "main",
          full_name: "koromo2010/game-fields-sdk-mocks",
          permissions: { push: true },
        });
      }) as typeof fetch,
      env: {
        SDK_MOCK_GITHUB_REPOSITORY: "koromo2010/game-fields-sdk-mocks",
        SDK_MOCK_GITHUB_WRITE_TOKEN: "test-secret",
      },
    }),
    (error) => (
      error instanceof GamePackageGitTargetError
      && error.code === "SDK_PACKAGE_GIT_REPOSITORY_EMPTY_READ_REF"
    ),
  );
});

test("package transfer initializes an empty repository before creating its storage branch", async () => {
  const { files } = packageFixture();
  const initCommit = "1".repeat(40);
  const releaseCommit = "2".repeat(40);
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  let blobIndex = 0;
  let treeIndex = 0;

  const revision = await saveGamePackageFilesToGit({
    instanceId: "moi-lab",
    gameId: "portable-fixture",
    files,
  }, {
    env: {
      SDK_MOCK_GITHUB_REPOSITORY: "koromo2010/game-fields-sdk-mocks",
      SDK_MOCK_GITHUB_WRITE_TOKEN: "test-secret",
    },
    fetchRuntime: (async (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string"
        ? JSON.parse(init.body)
        : null;
      requests.push({ method, path: url.pathname, body });

      if (
        method === "GET"
        && url.pathname.endsWith("/git/ref/heads/sdk-previews")
      ) {
        return Response.json(
          { message: "Git Repository is empty." },
          { status: 409 },
        );
      }
      if (
        method === "GET"
        && url.pathname === "/repos/koromo2010/game-fields-sdk-mocks"
      ) {
        return Response.json({ default_branch: "main" });
      }
      if (
        method === "GET"
        && url.pathname.endsWith("/git/ref/heads/main")
      ) {
        return Response.json(
          { message: "Git Repository is empty." },
          { status: 409 },
        );
      }
      if (
        method === "PUT"
        && url.pathname.endsWith("/contents/.game-fields-storage")
      ) {
        return Response.json({ commit: { sha: initCommit } }, { status: 201 });
      }
      if (method === "POST" && url.pathname.endsWith("/git/refs")) {
        return Response.json({ object: { sha: initCommit } }, { status: 201 });
      }
      if (
        method === "GET"
        && url.pathname.endsWith(`/git/commits/${initCommit}`)
      ) {
        return Response.json({ tree: { sha: "parent-tree" } });
      }
      if (method === "POST" && url.pathname.endsWith("/git/blobs")) {
        blobIndex += 1;
        return Response.json({ sha: `blob-${blobIndex}` }, { status: 201 });
      }
      if (method === "POST" && url.pathname.endsWith("/git/trees")) {
        treeIndex += 1;
        return Response.json(
          { sha: treeIndex === 1 ? "package-tree" : "release-tree" },
          { status: 201 },
        );
      }
      if (method === "POST" && url.pathname.endsWith("/git/commits")) {
        return Response.json({ sha: releaseCommit }, { status: 201 });
      }
      if (
        method === "PATCH"
        && url.pathname.endsWith("/git/refs/heads/sdk-previews")
      ) {
        return Response.json({ object: { sha: releaseCommit } });
      }
      return Response.json({ message: "Unexpected request" }, { status: 500 });
    }) as typeof fetch,
  });

  assert.equal(revision, releaseCommit);
  const initialization = requests.find((request) => (
    request.method === "PUT"
    && request.path.endsWith("/contents/.game-fields-storage")
  ));
  assert.deepEqual(initialization?.body, {
    message: "Initialize Game Fields SDK package storage",
    content: Buffer.from(
      "Game Fields SDK package storage. Managed automatically.\n",
      "utf8",
    ).toString("base64"),
    branch: "main",
  });
  assert.ok(requests.some((request) => (
    request.method === "POST"
    && request.path.endsWith("/git/refs")
    && (request.body as { ref?: string } | null)?.ref
      === "refs/heads/sdk-previews"
  )));
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
