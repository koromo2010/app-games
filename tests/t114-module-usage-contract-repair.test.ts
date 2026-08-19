import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GAME_SDK_MODULE_CATALOG,
  GAME_SDK_MODULE_DELIVERIES,
  type GameSdkModuleId,
} from "@game-fields/game-sdk/modules";
import {
  GAME_SDK_MODULE_USAGE_INPUT_DELIVERIES,
  GameSdkModuleUsageValidationError,
  normalizeGameSdkModuleUsageDelivery,
  validateGameSdkModuleUsage,
} from "@game-fields/game-sdk/module-usage";
import { PUBLISH_MOCK_TOOL } from "../apps/sdk-portal/lib/sdk-mcp-tool-definitions.ts";
import { buildNodeFreeGamePackage } from "../apps/sdk-portal/lib/node-free-game-package.ts";
import { sharedGameSourceSha256 } from "../apps/sdk-portal/lib/module-authoring-contract.ts";
import { jankenManifest } from "./fixtures/t114-publish-mock-v002/source/manifest.ts";
import { createPrototypeAdapter } from "./fixtures/t114-publish-mock-v002/source/prototype-adapter.ts";

const fixtureRoot = "tests/fixtures/t114-publish-mock-v002";
const requiredIds = [
  "start-guard",
  "phase-flow",
  "collect-choice",
  "secret-presentation",
  "standard-outcome",
] as const;
const disabledIds = [
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
] as const;
const binding = {
  environment: "development" as const,
  moduleProfileRevision: "83c26b8c-18da-4933-a448-1c933ada1ea5",
  moduleContractDigest: "a".repeat(64),
  sdkPackageVersion: "0.2.0",
  sdkContractVersion: 2,
};

function definition(id: GameSdkModuleId) {
  return GAME_SDK_MODULE_CATALOG.find((item) => item.id === id)!;
}

function readFixtureFiles() {
  return Object.fromEntries([
    "source/app-set.ts",
    "source/contracts.ts",
    "source/manifest.ts",
    "source/server-module.ts",
    "source/game-client.tsx",
    "source/prototype-adapter.ts",
    "index.html",
    "styles.css",
    "mock.js",
    "preview.json",
  ].map((path) => {
    const diskPath = path.startsWith("source/")
      ? `${fixtureRoot}/${path}`
      : `${fixtureRoot}/mock/${path}`;
    return [path, readFileSync(diskPath, "utf8")];
  }));
}

function readModuleUsage() {
  return JSON.parse(readFileSync(`${fixtureRoot}/module-usage.json`, "utf8"));
}

function contract() {
  return {
    ...binding,
    requiredModuleIds: [...requiredIds],
    disabledModuleIds: [...disabledIds],
    requiredModules: requiredIds.map(definition),
    disabledModules: disabledIds.map(definition),
  };
}

function fixtureInput() {
  return {
    contract: contract(),
    binding,
    moduleUsage: readModuleUsage(),
    files: readFixtureFiles(),
  };
}

function oneModuleInput(
  id: GameSdkModuleId,
  delivery: string,
  source: string,
  packageExports: string[],
  publicApis: string[],
) {
  const moduleDefinition = definition(id);
  return {
    contract: {
      ...binding,
      requiredModuleIds: [id],
      disabledModuleIds: [],
      requiredModules: [moduleDefinition],
      disabledModules: [],
    },
    binding,
    moduleUsage: [{
      id,
      delivery,
      status: "used",
      packageExports,
      publicApis,
      sourcePaths: ["source/game-client.tsx"],
      observableRuntimeMarker: [`t114-${id}`],
      nonReimplementationEvidence: [`official-sdk:${id}`],
    }],
    files: { "source/game-client.tsx": source },
  };
}

function assertDeliveryProblem(
  callback: () => unknown,
  moduleId: string,
  expected: string,
  actual: string,
) {
  assert.throws(callback, (error: unknown) => {
    assert.ok(error instanceof GameSdkModuleUsageValidationError);
    assert.equal(error.code, "MODULE_USAGE_MATRIX_INCOMPLETE");
    assert.deepEqual(error.problems[0], {
      moduleId,
      path: "delivery",
      reason: "MODULE_USAGE_MATRIX_INCOMPLETE",
      expected,
      actual,
    });
    return true;
  });
}

test("published publish_mock schema exposes the canonical four deliveries and the input-only legacy alias", () => {
  const moduleUsage = PUBLISH_MOCK_TOOL.inputSchema.properties.moduleUsage;
  assert.equal(PUBLISH_MOCK_TOOL.name, "publish_mock");
  assert.deepEqual(GAME_SDK_MODULE_DELIVERIES, [
    "platform-owned",
    "sdk-helper",
    "platform-resource",
    "sdk-resource",
  ]);
  assert.deepEqual(
    moduleUsage.items.properties.delivery.enum,
    GAME_SDK_MODULE_USAGE_INPUT_DELIVERIES,
  );
  assert.deepEqual(moduleUsage.items.properties.delivery.enum, [
    "platform-owned",
    "sdk-helper",
    "platform-resource",
    "sdk-resource",
    "sdk-package",
  ]);
});

test("delivery normalization accepts canonical values and narrowly maps sdk-package", () => {
  for (const delivery of GAME_SDK_MODULE_DELIVERIES) {
    assert.equal(normalizeGameSdkModuleUsageDelivery(delivery, delivery), delivery);
  }
  assert.equal(normalizeGameSdkModuleUsageDelivery("sdk-package", "sdk-helper"), "sdk-helper");
  assert.equal(normalizeGameSdkModuleUsageDelivery("sdk-package", "sdk-resource"), "sdk-resource");
  assert.equal(normalizeGameSdkModuleUsageDelivery("sdk-package", "platform-owned"), null);
  assert.equal(normalizeGameSdkModuleUsageDelivery("sdk-package", "platform-resource"), null);
});

test("five-module fixture passes with canonical and legacy SDK-helper rows and emits canonical audit values", () => {
  const canonical = validateGameSdkModuleUsage(fixtureInput());
  assert.deepEqual(canonical.requiredModuleIds, requiredIds);
  assert.equal(canonical.moduleUsage.every((row) => row.delivery === "sdk-helper"), true);
  assert.equal(canonical.moduleUsage.every((row) => row.runtimeEvidence.length === 1), true);

  const legacy = fixtureInput();
  for (const row of legacy.moduleUsage) row.delivery = "sdk-package";
  const legacyAudit = validateGameSdkModuleUsage(legacy);
  assert.equal(legacyAudit.moduleUsage.every((row) => row.delivery === "sdk-helper"), true);
});

test("SDK-resource legacy input and platform-resource canonical input validate end to end", () => {
  const cardSource = `
import { createStandardPlayingCardDeck } from "@game-fields/game-sdk/playing-cards";
import { PlayingCardView } from "@game-fields/game-sdk/playing-cards-react";
declare function moduleRuntimeEvidence(marker: string): void;
export const deck = createStandardPlayingCardDeck();
export const Card = PlayingCardView;
moduleRuntimeEvidence("t114-playing-cards");`;
  for (const delivery of ["sdk-resource", "sdk-package"]) {
    const audit = validateGameSdkModuleUsage(oneModuleInput(
      "playing-cards",
      delivery,
      cardSource,
      [
        "@game-fields/game-sdk/playing-cards",
        "@game-fields/game-sdk/playing-cards-react",
      ],
      ["createStandardPlayingCardDeck", "PlayingCardView"],
    ));
    assert.equal(audit.moduleUsage[0]?.delivery, "sdk-resource");
  }

  const contentSource = `
import type { GameSdkContentSource } from "@game-fields/game-sdk/content-source";
declare function moduleRuntimeEvidence(marker: string): void;
export const draw = (source: GameSdkContentSource) => source.drawWords({ count: 1 });
export type ContentSource = GameSdkContentSource;
moduleRuntimeEvidence("t114-content-source");`;
  const audit = validateGameSdkModuleUsage(oneModuleInput(
    "content-source",
    "platform-resource",
    contentSource,
    ["@game-fields/game-sdk/content-source"],
    ["GameSdkContentSource.drawWords"],
  ));
  assert.equal(audit.moduleUsage[0]?.delivery, "platform-resource");
});

test("delivery mismatches remain fail-closed with canonical expected and submitted actual", () => {
  const phase = fixtureInput();
  phase.moduleUsage.find((row: { id: string }) => row.id === "phase-flow").delivery = "sdk-resource";
  assertDeliveryProblem(
    () => validateGameSdkModuleUsage(phase),
    "phase-flow",
    "sdk-helper",
    "sdk-resource",
  );

  for (const [id, expected, actual] of [
    ["drawing", "sdk-resource", "sdk-helper"],
    ["content-source", "platform-resource", "sdk-package"],
  ] as const) {
    const moduleDefinition = definition(id);
    assertDeliveryProblem(() => validateGameSdkModuleUsage({
      contract: {
        ...binding,
        requiredModuleIds: [id],
        disabledModuleIds: [],
        requiredModules: [moduleDefinition],
        disabledModules: [],
      },
      binding,
      moduleUsage: [{
        id,
        delivery: actual,
        status: "used",
        packageExports: [],
        publicApis: [],
        sourcePaths: ["source/app-set.ts"],
        observableRuntimeMarker: ["marker"],
        nonReimplementationEvidence: ["official-sdk"],
      }],
      files: { "source/app-set.ts": "export {};" },
    }), id, expected, actual);
  }
});

test("five-module contract rejects missing rows, old fifteen-row matrices, and disabled API imports", () => {
  const missing = fixtureInput();
  missing.moduleUsage.pop();
  assert.throws(
    () => validateGameSdkModuleUsage(missing),
    /MODULE_USAGE_MATRIX_INCOMPLETE:standard-outcome/,
  );

  const oldMatrix = fixtureInput();
  oldMatrix.moduleUsage = [
    ...oldMatrix.moduleUsage,
    ...GAME_SDK_MODULE_CATALOG
      .filter((item) => item.group === "flow" || item.group === "resource")
      .slice(0, 15)
      .map((item) => ({ id: item.id })),
  ];
  assert.throws(
    () => validateGameSdkModuleUsage(oldMatrix),
    /MODULE_USAGE_MATRIX_INCOMPLETE/,
  );

  const disabled = fixtureInput();
  disabled.files["source/app-set.ts"] += "\nvoid recordGameSdkVote;";
  assert.throws(
    () => validateGameSdkModuleUsage(disabled),
    /DISABLED_MODULE_USED:vote:recordGameSdkVote/,
  );
});

test("profile delta is exactly five required and ten disabled modules with no local write", () => {
  const delta = JSON.parse(readFileSync(`${fixtureRoot}/profile-delta.json`, "utf8"));
  const fixture = JSON.parse(readFileSync(`${fixtureRoot}/fixture.json`, "utf8"));
  assert.equal(delta.baseModuleProfileRevision, binding.moduleProfileRevision);
  assert.deepEqual(delta.required, requiredIds);
  assert.deepEqual(delta.disabled, disabledIds);
  assert.deepEqual(Object.keys(delta.moduleDecisions), disabledIds);
  for (const id of disabledIds) {
    assert.equal(delta.moduleDecisions[id].mode, "disabled");
    assert.equal(typeof delta.moduleDecisions[id].reason, "string");
    assert.ok(delta.moduleDecisions[id].reason.length > 0);
    assert.ok(delta.moduleDecisions[id].reason.length <= 240);
  }
  assert.equal(delta.profileWritesPerformed, 0);
  assert.equal(delta.confirmationWritesPerformed, 0);
  assert.equal(fixture.runtimeWritesPerformed, 0);
  assert.equal(fixture.moduleConfirmationsPerformed, 0);
  assert.equal(fixture.publishMockCallsPerformed, 0);
});

test("runtime evidence appears only after its corresponding prototype transition", async () => {
  const adapter = createPrototypeAdapter();
  const snapshots: Array<{ view?: { app?: { runtimeMarkers: string[] } } }> = [];
  adapter.subscribe((snapshot) => snapshots.push(snapshot));
  assert.deepEqual(snapshots.at(-1)?.view?.app?.runtimeMarkers, [
    "t114-start-guard",
    "t114-phase-flow",
    "t114-secret-presentation",
  ]);

  await adapter.send({ type: "prototype/choose", player: 0, choice: "rock" });
  assert.equal(
    snapshots.at(-1)?.view?.app?.runtimeMarkers.includes("t114-collect-choice"),
    true,
  );
  assert.equal(
    snapshots.at(-1)?.view?.app?.runtimeMarkers.includes("t114-standard-outcome"),
    false,
  );

  await adapter.send({ type: "prototype/choose", player: 1, choice: "scissors" });
  assert.equal(
    snapshots.at(-1)?.view?.app?.runtimeMarkers.includes("t114-standard-outcome"),
    true,
  );
});

test("fixture inventory pins every payload byte and Git-style blob", () => {
  const inventory = JSON.parse(readFileSync(`${fixtureRoot}/fixture-manifest.json`, "utf8"));
  let totalBytes = 0;
  let sourceBytes = 0;
  for (const entry of inventory.files) {
    const bytes = readFileSync(`${fixtureRoot}/${entry.path}`);
    totalBytes += bytes.length;
    if (entry.path.startsWith("source/")) sourceBytes += bytes.length;
    assert.equal(bytes.length, entry.utf8Bytes, entry.path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, entry.path);
    assert.equal(
      createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"),
      entry.gitBlob,
      entry.path,
    );
  }
  assert.equal(inventory.files.length, inventory.payloadFileCount);
  assert.equal(totalBytes, inventory.payloadTotalUtf8Bytes);
  assert.equal(sourceBytes, inventory.sourceTotalUtf8Bytes);
  assert.equal(sharedGameSourceSha256(readFixtureFiles()), inventory.sharedGameSourceSha256);
});

test("five-module fixture builds through the node-free package boundary", async () => {
  const files = readFixtureFiles();
  const built = await buildNodeFreeGamePackage({
    gameId: "t114-publish-mock-fixture",
    manifest: jankenManifest,
    files,
    moduleBinding: binding,
  });
  assert.ok(built.prototypeFiles["mock.js"]?.includes("t114-standard-outcome"));
  const inventory = JSON.parse(readFileSync(`${fixtureRoot}/fixture-manifest.json`, "utf8"));
  assert.deepEqual(built.map((file) => file.path).sort(), inventory.expectedBuildArtifacts);
  assert.equal(
    createHash("sha256")
      .update(built.find((file) => file.path === "game-fields-package.json")!.content)
      .digest("hex"),
    inventory.manifestIdentitySha256,
  );
  assert.ok(built.find((file) => file.path === "server.bundle.js"));
  assert.ok(built.find((file) => file.path === "game-fields-package.json"));
});
