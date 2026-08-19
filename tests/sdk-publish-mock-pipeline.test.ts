import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import test from "node:test";

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

const {
  publishMockPipeline,
  PublishMockPipelineError,
} = await import("../apps/sdk-portal/lib/publish-mock-pipeline.ts");
const { GAME_SDK_MODULE_CATALOG } = await import("@game-fields/game-sdk/modules");
const { validateGameSdkModuleUsage } = await import("@game-fields/game-sdk/module-usage");

const revision = "a".repeat(40);
const sourceHash = "b".repeat(64);
const contract = {
  moduleProfileRevision: "11111111-1111-4111-8111-111111111111",
  moduleContractDigest: "c".repeat(64),
  sdkPackage: { version: "0.2.0" },
};
const usageAudit = {
  binding: {
    environment: "production" as const,
    moduleProfileRevision: contract.moduleProfileRevision,
    moduleContractDigest: contract.moduleContractDigest,
    sdkPackageVersion: "0.2.0",
    sdkContractVersion: 2,
  },
  requiredModuleIds: [],
  disabledModuleIds: [],
  moduleUsage: [],
};
const input = {
  creatorId: "creator-1",
  creatorSlug: "krm",
  gameId: "janken-test",
  title: "Janken",
  description: "A fixture game",
  manifest: { id: "janken-test" },
  files: { "source/app-set.ts": "export const appSet = {};" },
  contract,
  usageAudit,
};

function fakeBuild() {
  return {
    prototypeFiles: {
      "index.html": "<!doctype html><html><body></body></html>",
      "styles.css": "body{}",
      "mock.js": "void 0",
      "preview.json": JSON.stringify({ gameId: "janken-test" }),
    },
  } as never;
}

function fakeManifest() {
  return {
    stage: "mock" as const,
    id: "janken-test",
    settings: [],
    reviewEvidence: { valid: true, findings: [] },
  } as never;
}

function databaseMock(options: { existing?: boolean; updateRows?: unknown[] } = {}) {
  const calls: string[] = [];
  const database = (async (strings: TemplateStringsArray) => {
    const query = strings.join("?");
    calls.push(query.includes("SELECT mock_revision") ? "lookup" : "update");
    if (query.includes("SELECT mock_revision")) {
      return options.existing
        ? [{ mockRevision: revision, sharedSourceSha256: sourceHash, title: input.title, description: input.description }]
        : [];
    }
    return options.updateRows ?? [{ id: "game-1" }];
  }) as never;
  return { calls, database };
}

function dependencies(options: {
  existing?: boolean;
  updateRows?: unknown[];
  build?: () => unknown;
  saveGit?: () => Promise<string>;
} = {}) {
  const db = databaseMock(options);
  let gitWrites = 0;
  return {
    db,
    gitWrites: () => gitWrites,
    dependencies: {
      ensureSchema: async () => {},
      sql: db.database,
      build: async () => options.build ? options.build() : fakeBuild(),
      parseManifest: () => fakeManifest(),
      sourceHash: () => sourceHash,
      saveGit: async () => {
        gitWrites += 1;
        return options.saveGit ? options.saveGit() : revision;
      },
    },
  } as const;
}

test("publish mock saves Git once, then DB once, and returns one revision", async () => {
  const fixture = dependencies();
  const result = await publishMockPipeline(input, fixture.dependencies);
  assert.equal(result.saved, true);
  assert.equal(result.prototypeRevision, revision);
  assert.equal(fixture.gitWrites(), 1);
  assert.deepEqual(fixture.db.calls, ["lookup", "update"]);
});

test("same payload reuses an existing revision without a second Git or DB write", async () => {
  const fixture = dependencies({ existing: true });
  const result = await publishMockPipeline(input, fixture.dependencies);
  assert.equal(result.prototypeRevision, revision);
  assert.equal(fixture.gitWrites(), 0);
  assert.deepEqual(fixture.db.calls, ["lookup"]);
});

test("build failure reports a stable validation stage and performs no downstream write", async () => {
  const fixture = dependencies({ build: () => { throw new Error("esbuild secret stack"); } });
  await assert.rejects(
    publishMockPipeline(input, fixture.dependencies),
    (error: unknown) => {
      assert.ok(error instanceof PublishMockPipelineError);
      assert.equal(error.code, "SDK_PROTOTYPE_BUILD_FAILED");
      assert.equal(error.layer, "validation");
      assert.equal(error.operation, "prototype-build");
      assert.doesNotMatch(JSON.stringify(error), /secret|stack/);
      return true;
    },
  );
  assert.equal(fixture.gitWrites(), 0);
  assert.deepEqual(fixture.db.calls, []);
});

test("Git failure reports a stable store stage and performs no DB update", async () => {
  const fixture = dependencies({ saveGit: async () => { throw new Error("provider token"); } });
  await assert.rejects(
    publishMockPipeline(input, fixture.dependencies),
    (error: unknown) => {
      assert.ok(error instanceof PublishMockPipelineError);
      assert.equal(error.code, "SDK_PROTOTYPE_GIT_WRITE_FAILED");
      assert.equal(error.layer, "store");
      assert.equal(error.operation, "mock-revision-git-save");
      assert.doesNotMatch(JSON.stringify(error), /provider|token/);
      return true;
    },
  );
  assert.equal(fixture.gitWrites(), 1);
  assert.deepEqual(fixture.db.calls, ["lookup"]);
});

test("DB failure after Git save identifies the partial state and revision", async () => {
  const fixture = dependencies({
    updateRows: undefined,
  });
  const failingSql = (async (strings: TemplateStringsArray) => {
    const query = strings.join("?");
    fixture.db.calls.push(query.includes("SELECT mock_revision") ? "lookup" : "update");
    if (query.includes("SELECT mock_revision")) return [];
    throw new Error("SQL connection secret stack");
  }) as never;
  await assert.rejects(
    publishMockPipeline(input, { ...fixture.dependencies, sql: failingSql }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as PublishMockPipelineError).code, "SDK_PROTOTYPE_DB_UPDATE_FAILED");
      assert.equal((error as PublishMockPipelineError).operation, "mock-revision-update");
      assert.equal((error as PublishMockPipelineError).revision, revision);
      assert.doesNotMatch(JSON.stringify(error), /SQL|secret|stack/);
      return true;
    },
  );
  assert.equal(fixture.gitWrites(), 1);
  assert.deepEqual(fixture.db.calls, ["lookup", "update"]);
});

test("stale confirmed module profile is typed and records the partial revision", async () => {
  const fixture = dependencies({ updateRows: [] });
  await assert.rejects(
    publishMockPipeline(input, fixture.dependencies),
    (error: unknown) => {
      assert.ok(error instanceof PublishMockPipelineError);
      assert.equal(error.code, "MODULE_PROFILE_STALE");
      assert.equal(error.layer, "validation");
      assert.equal(error.operation, "mock-revision-update");
      assert.equal(error.revision, revision);
      return true;
    },
  );
  assert.equal(fixture.gitWrites(), 1);
});

test("validated T-114 five-module audit reaches the injected persistence boundary exactly once", async () => {
  const root = "tests/fixtures/t114-publish-mock-v002";
  const requiredModuleIds = [
    "start-guard",
    "phase-flow",
    "collect-choice",
    "secret-presentation",
    "standard-outcome",
  ];
  const disabledModuleIds = [
    "rounds",
    "turn-order",
    "collect-text",
    "vote",
    "role-assignment",
    "team-assignment",
    "content-source",
    "llm",
    "playing-cards",
    "drawing",
  ];
  const files = Object.fromEntries([
    "app-set.ts",
    "contracts.ts",
    "game-client.tsx",
    "manifest.ts",
    "prototype-adapter.ts",
    "server-module.ts",
  ].map((file) => [
    `source/${file}`,
    readFileSync(`${root}/source/${file}`, "utf8"),
  ]));
  const audit = validateGameSdkModuleUsage({
    contract: {
      ...usageAudit.binding,
      requiredModuleIds,
      disabledModuleIds,
      requiredModules: GAME_SDK_MODULE_CATALOG.filter((item) => requiredModuleIds.includes(item.id)),
      disabledModules: GAME_SDK_MODULE_CATALOG.filter((item) => disabledModuleIds.includes(item.id)),
    },
    binding: usageAudit.binding,
    moduleUsage: JSON.parse(readFileSync(`${root}/module-usage.json`, "utf8")),
    files,
  });
  const fixture = dependencies();
  const result = await publishMockPipeline({ ...input, files, usageAudit: audit }, fixture.dependencies);
  assert.equal(result.saved, true);
  assert.equal(fixture.gitWrites(), 1);
  assert.deepEqual(fixture.db.calls, ["lookup", "update"]);
});
