import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import path from "node:path";
import test from "node:test";
import { jankenManifest } from "./fixtures/t114-publish-mock-v003/source/manifest.ts";

const registerHooks = (nodeModule as unknown as {
  registerHooks(options: {
    resolve(
      specifier: string,
      context: object,
      nextResolve: (specifier: string, context: object) => unknown,
    ): void;
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

const { buildNodeFreeGamePackage } = await import(
  "../apps/sdk-portal/lib/node-free-game-package.ts"
);
const { PrototypeBuildError } = await import(
  "../apps/sdk-portal/lib/prototype-builder-diagnostics.ts"
);
const {
  publishMockPipeline,
  PublishMockPipelineError,
} = await import("../apps/sdk-portal/lib/publish-mock-pipeline.ts");
const { sharedGameSourceSha256 } = await import(
  "../apps/sdk-portal/lib/module-authoring-contract.ts"
);
const { GAME_SDK_MODULE_CATALOG } = await import("@game-fields/game-sdk/modules");
const { validateGameSdkMockQuality } = await import("@game-fields/game-sdk/mock-quality");
const { validateGameSdkModuleUsage } = await import("@game-fields/game-sdk/module-usage");

const fixtureRoot = "tests/fixtures/t114-publish-mock-v003";
const v002Root = "tests/fixtures/t114-publish-mock-v002";
const requiredFileKeys = [
  "index.html",
  "styles.css",
  "mock.js",
  "preview.json",
  "source/app-set.ts",
  "source/contracts.ts",
  "source/manifest.ts",
  "source/server-module.ts",
  "source/game-client.tsx",
  "source/prototype-adapter.ts",
] as const;
const sourceFileKeys = requiredFileKeys.filter((file) => file.startsWith("source/"));
const allowedImports = new Set([
  "@game-fields/game-sdk",
  "@game-fields/game-sdk/content-source",
  "@game-fields/game-sdk/drawing",
  "@game-fields/game-sdk/drawing-react",
  "@game-fields/game-sdk/llm",
  "@game-fields/game-sdk/modules",
  "@game-fields/game-sdk/playing-cards",
  "@game-fields/game-sdk/playing-cards-react",
  "@game-fields/game-sdk/portable-server",
  "@game-fields/game-sdk/resources",
  "@game-fields/game-sdk/runtime",
  "react",
  "react/jsx-runtime",
  "react-dom/client",
]);

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(`${fixtureRoot}/${relativePath}`, "utf8"));
}

function fixtureAssembly() {
  const publishInput = readJson("publish-input.json");
  const profile = readJson(publishInput.profileBindingPath);
  const manifest = readJson(publishInput.manifestPath);
  const moduleUsage = readJson(publishInput.moduleUsagePath);
  const files = Object.fromEntries(
    Object.entries(publishInput.files).map(([key, relativePath]) => [
      key,
      readFileSync(`${fixtureRoot}/${relativePath}`, "utf8"),
    ]),
  );
  const binding = {
    environment: profile.environment,
    moduleProfileRevision: profile.moduleProfileRevision,
    moduleContractDigest: profile.moduleContractDigest,
    sdkPackageVersion: profile.sdkPackageVersion,
    sdkContractVersion: profile.sdkContractVersion,
  };
  const contract = {
    ...binding,
    requiredModuleIds: profile.required,
    availableModuleIds: profile.available,
    disabledModuleIds: profile.disabled,
    requiredModules: GAME_SDK_MODULE_CATALOG.filter((item) => profile.required.includes(item.id)),
    availableModules: GAME_SDK_MODULE_CATALOG.filter((item) => profile.available.includes(item.id)),
    disabledModules: GAME_SDK_MODULE_CATALOG.filter((item) => profile.disabled.includes(item.id)),
  };
  const usageAudit = validateGameSdkModuleUsage({
    contract,
    binding,
    moduleUsage,
    files,
  });
  return { binding, contract, files, manifest, moduleUsage, profile, publishInput, usageAudit };
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function gitBlob(value: Buffer) {
  return createHash("sha1")
    .update(`blob ${value.length}\0`)
    .update(value)
    .digest("hex");
}

function malformedV002Files() {
  return Object.fromEntries([
    ...sourceFileKeys.map((file) => [file, readFileSync(`${v002Root}/${file}`, "utf8")]),
    ...["index.html", "styles.css", "mock.js", "preview.json"].map((file) => [
      `mock/${file}`,
      readFileSync(`${v002Root}/mock/${file}`, "utf8"),
    ]),
  ]);
}

function publishPipelineInput(assembly: ReturnType<typeof fixtureAssembly>, files = assembly.files) {
  return {
    creatorId: "local-t114-v014",
    creatorSlug: "test10-1",
    gameId: assembly.publishInput.gameId,
    title: assembly.publishInput.title,
    description: assembly.publishInput.description,
    manifest: assembly.manifest,
    files,
    contract: {
      moduleProfileRevision: assembly.binding.moduleProfileRevision,
      moduleContractDigest: assembly.binding.moduleContractDigest,
      sdkPackage: { version: assembly.binding.sdkPackageVersion },
    },
    usageAudit: assembly.usageAudit,
  };
}

test("fixture v003 is a self-contained direct publish input with unchanged game bytes", () => {
  const assembly = fixtureAssembly();
  assert.deepEqual(Object.keys(assembly.publishInput.files), requiredFileKeys);
  for (const [inputKey, relativePath] of Object.entries(assembly.publishInput.files)) {
    assert.equal(relativePath, inputKey, inputKey);
    assert.equal(inputKey.startsWith("mock/"), false, inputKey);
  }
  assert.deepEqual(assembly.manifest, jankenManifest);
  assert.equal(assembly.manifest.id, assembly.publishInput.gameId);
  assert.equal(
    assembly.binding.moduleProfileRevision,
    "4c029ae9-0eef-4b77-9625-b309d947dbcf",
  );
  assert.equal(
    assembly.binding.moduleContractDigest,
    "04a8d1f8ae6edb559c12d5717b738b29c9807cae928f0d5b62456393fbeb17f8",
  );
  assert.equal(assembly.binding.environment, "development");

  for (const file of requiredFileKeys) {
    const v002Path = file.startsWith("source/") ? file : `mock/${file}`;
    assert.equal(
      sha256(assembly.files[file]),
      sha256(readFileSync(`${v002Root}/${v002Path}`)),
      file,
    );
  }
});

test("fixture v003 passes the complete source/import/entrypoint and mock audit", () => {
  const assembly = fixtureAssembly();
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  for (const sourcePath of sourceFileKeys) {
    const bytes = readFileSync(`${fixtureRoot}/${sourcePath}`);
    assert.doesNotThrow(() => utf8.decode(bytes), sourcePath);
    assert.ok(bytes.length > 0 && bytes.length <= 256 * 1024, sourcePath);
    const source = assembly.files[sourcePath];
    const specifiers = [...source.matchAll(
      /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    )].map((match) => match[1]!);
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) {
        assert.ok(allowedImports.has(specifier), `${sourcePath}:${specifier}`);
        continue;
      }
      const requested = path.posix.normalize(
        path.posix.join(path.posix.dirname(sourcePath), specifier),
      );
      assert.equal(requested === ".." || requested.startsWith("../"), false, sourcePath);
      const candidates = [
        requested,
        requested.replace(/\.js$/, ".ts"),
        requested.replace(/\.js$/, ".tsx"),
        `${requested}.ts`,
        `${requested}.tsx`,
      ];
      assert.ok(candidates.some((candidate) => Object.hasOwn(assembly.files, candidate)), `${sourcePath}:${specifier}`);
    }
  }
  assert.match(assembly.files["source/server-module.ts"], /export const jankenServerModule/);
  assert.match(assembly.files["source/server-module.ts"], /createGameSdkOnlineRoomModule/);
  assert.match(assembly.files["source/game-client.tsx"], /export function mountGameClient/);
  assert.match(assembly.files["source/prototype-adapter.ts"], /export function createPrototypeAdapter/);

  const quality = validateGameSdkMockQuality({
    files: Object.fromEntries(
      ["index.html", "styles.css", "mock.js", "preview.json"].map((file) => [
        file,
        assembly.files[file],
      ]),
    ),
  });
  assert.equal(quality.gameId, assembly.publishInput.gameId);
});

test("fixture v002 packaging reproduces both prototype-build failure classes before persistence", async () => {
  const assembly = fixtureAssembly();
  await assert.rejects(
    buildNodeFreeGamePackage({
      gameId: assembly.publishInput.gameId,
      manifest: assembly.manifest,
      files: malformedV002Files(),
      moduleBinding: assembly.binding,
    }),
    (error: unknown) => {
      assert.ok(error instanceof PrototypeBuildError);
      assert.equal(error.code, "MOCK_QUALITY_INVALID");
      assert.equal(error.stage, "mock-validation");
      return true;
    },
  );
  await assert.rejects(
    buildNodeFreeGamePackage({
      gameId: assembly.publishInput.gameId,
      manifest: readJson("preview.json"),
      files: assembly.files,
      moduleBinding: assembly.binding,
    }),
    (error: unknown) => {
      assert.ok(error instanceof PrototypeBuildError);
      assert.equal(error.code, "MANIFEST_INVALID");
      assert.equal(error.stage, "input-validation");
      return true;
    },
  );

  let schemaCalls = 0;
  let sqlCalls = 0;
  let gitWrites = 0;
  await assert.rejects(
    publishMockPipeline(publishPipelineInput(assembly, malformedV002Files()), {
      ensureSchema: async () => { schemaCalls += 1; },
      sql: (async () => { sqlCalls += 1; return []; }) as never,
      saveGit: async () => { gitWrites += 1; return "a".repeat(40); },
      recordBuildFailure: () => {},
    }),
    (error: unknown) => {
      assert.ok(error instanceof PublishMockPipelineError);
      assert.equal(error.code, "SDK_PROTOTYPE_BUILD_FAILED");
      assert.equal(error.layer, "validation");
      assert.equal(error.operation, "prototype-build");
      assert.equal(error.buildStage, "mock-validation");
      assert.equal(error.buildFailureCode, "MOCK_QUALITY_INVALID");
      assert.equal(error.retryable, false);
      return true;
    },
  );
  assert.equal(schemaCalls, 0);
  assert.equal(sqlCalls, 0);
  assert.equal(gitWrites, 0);
});

test("fixture v003 builds all bounded outputs and preserves binding/source identity", async () => {
  const assembly = fixtureAssembly();
  const built = await buildNodeFreeGamePackage({
    gameId: assembly.publishInput.gameId,
    manifest: assembly.manifest,
    files: assembly.files,
    moduleBinding: assembly.binding,
  });
  const inventory = readJson("fixture-manifest.json");
  assert.deepEqual(built.map((file) => file.path).sort(), inventory.expectedBuildArtifacts);
  const packageManifestFile = built.find((file) => file.path === "game-fields-package.json");
  const serverBundle = built.find((file) => file.path === "server.bundle.js");
  const formalClientBundle = built.find((file) => file.path === "mock.js");
  assert.ok(packageManifestFile);
  assert.ok(serverBundle?.content.length);
  assert.ok(formalClientBundle?.content.length);
  assert.ok(built.prototypeFiles["mock.js"]?.length);
  for (const output of [serverBundle!.content, formalClientBundle!.content, built.prototypeFiles["mock.js"]]) {
    assert.ok(Buffer.byteLength(output, "utf8") < 1024 * 1024);
  }
  const packageManifest = JSON.parse(packageManifestFile.content);
  assert.equal(packageManifest.authoring.environment, assembly.binding.environment);
  assert.equal(packageManifest.authoring.moduleProfileRevision, assembly.binding.moduleProfileRevision);
  assert.equal(packageManifest.authoring.moduleContractDigest, assembly.binding.moduleContractDigest);
  assert.equal(packageManifest.authoring.sharedSourceSha256, sharedGameSourceSha256(assembly.files));
  assert.equal(sha256(packageManifestFile.content), inventory.manifestIdentitySha256);
  assert.match(built.prototypeFiles["mock.js"], /t114-standard-outcome/);
});

test("fixture v003 reaches only injected publish persistence boundaries once", async () => {
  const assembly = fixtureAssembly();
  const databaseCalls: string[] = [];
  let schemaCalls = 0;
  let gitWrites = 0;
  const sql = (async (strings: TemplateStringsArray) => {
    const query = strings.join("?");
    if (query.includes("SELECT mock_revision")) {
      databaseCalls.push("lookup");
      return [];
    }
    databaseCalls.push("update");
    return [{ id: "local-t114-v014" }];
  }) as never;
  const result = await publishMockPipeline(publishPipelineInput(assembly), {
    ensureSchema: async () => { schemaCalls += 1; },
    sql,
    saveGit: async ({ files }) => {
      gitWrites += 1;
      assert.ok(files["index.html"]);
      assert.ok(files["mock.js"]);
      return "a".repeat(40);
    },
  });
  assert.equal(result.saved, true);
  assert.equal(result.prototypeRevision, "a".repeat(40));
  assert.equal(result.moduleBinding.moduleProfileRevision, assembly.binding.moduleProfileRevision);
  assert.equal(schemaCalls, 1);
  assert.equal(gitWrites, 1);
  assert.deepEqual(databaseCalls, ["lookup", "update"]);
});

test("fixture v003 inventory pins every payload byte and Git-style blob", () => {
  const inventory = readJson("fixture-manifest.json");
  let totalBytes = 0;
  let sourceBytes = 0;
  for (const entry of inventory.files) {
    const bytes = readFileSync(`${fixtureRoot}/${entry.path}`);
    totalBytes += bytes.length;
    if (entry.path.startsWith("source/")) sourceBytes += bytes.length;
    assert.equal(bytes.length, entry.utf8Bytes, entry.path);
    assert.equal(sha256(bytes), entry.sha256, entry.path);
    assert.equal(gitBlob(bytes), entry.gitBlob, entry.path);
  }
  assert.equal(inventory.fixtureVersion, "v003");
  assert.equal(inventory.files.length, inventory.payloadFileCount);
  assert.equal(totalBytes, inventory.payloadTotalUtf8Bytes);
  assert.equal(sourceBytes, inventory.sourceTotalUtf8Bytes);
  assert.equal(sharedGameSourceSha256(fixtureAssembly().files), inventory.sharedGameSourceSha256);
});
