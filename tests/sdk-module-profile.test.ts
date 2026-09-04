import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GAME_SDK_MODULE_CATALOG,
  GAME_SDK_MODULE_IDS,
  createInitialGameSdkModuleProfile,
  normalizeGameSdkModuleProfile,
  requiredGameSdkModuleIds,
  updateGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import { classifyCreatorGameModules } from "../apps/sdk-portal/lib/module-profile-classification.ts";

const read = (path: string) => readFileSync(path, "utf8");

test("new SDK mock starts with progression required and resources available", () => {
  const initial = createInitialGameSdkModuleProfile();
  const classification = classifyCreatorGameModules(initial);
  assert.equal(GAME_SDK_MODULE_IDS.length, GAME_SDK_MODULE_CATALOG.length);
  assert.equal(requiredGameSdkModuleIds(initial).length, GAME_SDK_MODULE_IDS.length - 4);
  assert.equal(classification.required.length, 6);
  assert.equal(classification.removable.length, 15);
  assert.equal(classification.optional.length, 0);
  assert.equal(classification.available.length, 3);
  assert.equal(classification.standard.length, 1);
  assert.deepEqual(normalizeGameSdkModuleProfile(undefined), initial);
});

test("human review can remove progression modules but cannot disable shared resources", () => {
  const initial = createInitialGameSdkModuleProfile();
  const reviewed = updateGameSdkModuleProfile(initial, {
    vote: {
      mode: "disabled",
      reason: "投票が存在しないゲームのため",
    },
    rounds: {
      mode: "disabled",
      reason: "複数ラウンドが存在しないゲームのため",
    },
  });
  assert.equal(requiredGameSdkModuleIds(reviewed).length, GAME_SDK_MODULE_IDS.length - 6);
  assert.equal(reviewed.authentication.mode, "required");
  assert.equal(reviewed.drawing.mode, "available");
  assert.deepEqual(
    updateGameSdkModuleProfile(initial, {
      vote: { mode: "disabled" },
    }).vote,
    { mode: "disabled" },
  );
  assert.deepEqual(
    normalizeGameSdkModuleProfile({
      vote: { mode: "disabled", reason: "   " },
    }).vote,
    { mode: "disabled" },
  );
  assert.throws(
    () => updateGameSdkModuleProfile(initial, {
      authorization: {
        mode: "disabled",
        reason: "解除",
      },
    }),
    /GAME_SDK_MODULE_CHANGE_NOT_ALLOWED/,
  );
  assert.throws(
    () => updateGameSdkModuleProfile(initial, {
      "content-source": { mode: "disabled" },
    }),
    /GAME_SDK_MODULE_CHANGE_NOT_ALLOWED/,
  );
});

test("owner module selection does not ask for a reason when a module is unchecked", () => {
  const review = read(
    "apps/sdk-portal/app/[instanceId]/games/[gameId]/GameModuleReview.tsx",
  );
  assert.doesNotMatch(review, /window\.prompt/);
  assert.doesNotMatch(review, /必須から外す理由/);
  assert.match(review, /\[id\]: \{ mode: "disabled" \}/);
});

test("only the linked human owner route can mutate module requirements", () => {
  const route = read(
    "apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/modules/route.ts",
  );
  assert.match(route, /getSdkAccountPlayerId/);
  assert.match(route, /authenticateCreatorOwner/);
  assert.match(route, /prepareCreatorGameModuleProfileUpdate/);
  assert.match(route, /proposerClient: "Portal Owner"/);
  assert.match(route, /activeProfileChanged: false/);
  assert.match(route, /confirmCreatorGameModuleProfile/);
  assert.match(route, /humanConfirmed/);
  assert.doesNotMatch(route, /Bearer/);

  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  assert.match(mcp, /create_game_draft/);
  assert.match(mcp, /get_game_module_requirements/);
  assert.match(mcp, /requireEstablishedCreatorGameModuleContract/);
  assert.match(mcp, /moduleProfileRevision/);
  assert.match(mcp, /moduleContractDigest/);
  assert.match(mcp, /editableByAi: false/);
  assert.doesNotMatch(
    mcp,
    /name:\s*"set_game_module_requirements"/,
  );
});

test("game draft owns the initial profile and legacy static prototype REST is disabled", () => {
  const api = read(
    "apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/mock/route.ts",
  );
  const draftStore = read("apps/sdk-portal/lib/module-authoring-store.ts");
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  assert.match(api, /LEGACY_STATIC_MOCK_PATH_DISABLED/);
  assert.match(api, /status: 410/);
  assert.match(draftStore, /createInitialGameSdkModuleProfile/);
  assert.match(draftStore, /module_profile_revision/);
  assert.match(mcp, /name === "create_game_draft"/);
  assert.match(mcp, /name === "publish_mock"/);
  assert.ok(mcp.indexOf('name === "create_game_draft"') < mcp.indexOf('name === "publish_mock"'));
});

test("creator AI receives the confirmed revision-bound delivery contract", () => {
  const aiFacingSources = [
    read("sdk/entry/START_GAME_FIELDS.md"),
    read("sdk/entry/START_CLAUDE_CODE.md"),
    read("sdk/starter-template/AGENTS.md"),
    read("sdk/starter-template/SDK_API.md"),
    read("sdk/starter-template/SDK_MODULE_CATALOG.md"),
    read("packages/game-sdk/README.md"),
  ];
  for (const source of aiFacingSources) {
    assert.match(source, /module|requiredModuleIds/i);
  }
  const work = aiFacingSources[0]!;
  const claude = aiFacingSources[1]!;
  assert.match(work, /moduleProfileRevision/);
  assert.match(work, /moduleContractDigest/);
  assert.match(work, /delivery/);
  assert.match(claude, /moduleProfileRevision/);
  assert.match(claude, /moduleContractDigest/);
});

test("creator contract enumerates the complete Platform DEBUG surface", () => {
  const sdkApi = read("sdk/starter-template/SDK_API.md");
  const requirements = read("sdk/starter-template/APP_REQUIREMENTS.md");
  const catalog = read("sdk/starter-template/SDK_MODULE_CATALOG.md");
  const debugModule = GAME_SDK_MODULE_CATALOG.find(
    (definition) => definition.id === "debug",
  );

  for (const command of [
    "room/debug-add-dummy",
    "room/debug-remove-dummy",
    "room/debug-auto-progress",
    "room/debug-simulate-timeout",
    "room/debug-set-connected",
    "room/debug-simulate-input-error",
  ]) {
    assert.match(sdkApi, new RegExp(command.replace("/", "\\/")));
  }
  for (const marker of [
    "閲覧プレイヤー視点切替",
    "安全な主要状態進行",
    "時間切れ・切断・入力エラー",
    "自動進行",
    "進行中断",
  ]) {
    assert.match(`${requirements}\n${catalog}\n${sdkApi}`, new RegExp(marker));
  }
  assert.match(debugModule?.description ?? "", /閲覧視点/);
  assert.match(debugModule?.description ?? "", /時間切れ・切断・入力拒否/);
});

test("machine-readable resource modules expose delivery and import contracts", () => {
  const content = GAME_SDK_MODULE_CATALOG.find(
    (definition) => definition.id === "content-source",
  );
  const cards = GAME_SDK_MODULE_CATALOG.find(
    (definition) => definition.id === "playing-cards",
  );
  const drawing = GAME_SDK_MODULE_CATALOG.find(
    (definition) => definition.id === "drawing",
  );
  assert.equal(content?.delivery, "platform-resource");
  assert.deepEqual(
    content?.packageExports,
    ["@game-fields/game-sdk/content-source"],
  );
  assert.equal(cards?.delivery, "sdk-resource");
  assert.ok(
    cards?.packageExports.includes(
      "@game-fields/game-sdk/playing-cards-react",
    ),
  );
  assert.equal(drawing?.delivery, "sdk-resource");
  assert.ok(
    drawing?.publicApis.includes("DrawingCanvas"),
  );
});

test("SDK dev preview exposes the owner-only module review surface", () => {
  const page = read(
    "apps/sdk-portal/app/[instanceId]/games/[gameId]/page.tsx",
  );
  const review = read(
    "apps/sdk-portal/app/[instanceId]/games/[gameId]/GameModuleReview.tsx",
  );
  assert.match(page, /resolveCreatorOwner/);
  assert.match(page, /getCreatorModuleCustomizationAccess/);
  assert.match(page, /GameModuleReview/);
  assert.match(review, /INITIAL DEFAULT \/ HUMAN REVIEW ON CHANGE/);
  assert.match(review, /初期デフォルトはsystem-default由来のcontractとして自動確定/);
  assert.match(review, /module変更案を作成/);
  assert.match(review, /GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG/);
  assert.match(review, /canCustomize/);

  const route = read(
    "apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/modules/route.ts",
  );
  assert.match(route, /getCreatorModuleCustomizationAccess/);
  assert.match(route, /customization_not_available/);
  assert.match(route, /status:\s*402/);
});

test("changing a module profile invalidates prototype approval and hides stale package candidates", () => {
  const registry = read("apps/sdk-portal/lib/instance-registry.ts");
  const proposalStore = read("apps/sdk-portal/lib/module-profile-proposal-store.ts");
  const submit = read(
    "apps/sdk-portal/app/api/dashboard/games/[instanceId]/[gameId]/submit/route.ts",
  );
  assert.match(proposalStore, /const nextRevision = randomUUID\(\)/);
  assert.match(proposalStore, /module_profile_revision = \$\{nextRevision\}::uuid/);
  assert.match(proposalStore, /mock_approved_revision = NULL/);
  assert.match(proposalStore, /prototype_module_contract_digest = NULL/);
  for (const source of [registry, submit]) {
    assert.match(source, /module_profile_revision = g\.module_profile_revision/);
    assert.match(source, /module_contract_digest = g\.module_contract_digest/);
    assert.match(source, /prototype_revision = g\.mock_approved_revision/);
    assert.match(source, /shared_source_sha256 = g\.prototype_source_sha256/);
  }
});
