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

test("new SDK mock starts with every module required", () => {
  const initial = createInitialGameSdkModuleProfile();
  const classification = classifyCreatorGameModules(initial);
  assert.equal(GAME_SDK_MODULE_IDS.length, GAME_SDK_MODULE_CATALOG.length);
  assert.deepEqual(requiredGameSdkModuleIds(initial), GAME_SDK_MODULE_IDS);
  assert.equal(classification.required.length, 7);
  assert.equal(classification.removable.length, 31);
  assert.equal(classification.optional.length, 0);
  assert.deepEqual(normalizeGameSdkModuleProfile(undefined), initial);
});

test("human review keeps required modules locked and records optional reasons", () => {
  const initial = createInitialGameSdkModuleProfile();
  const reviewed = updateGameSdkModuleProfile(initial, {
    vote: {
      mode: "disabled",
      reason: "投票が存在しないゲームのため",
    },
    drawing: {
      mode: "disabled",
      reason: "描画操作が存在しないゲームのため",
    },
  });
  assert.equal(requiredGameSdkModuleIds(reviewed).length, GAME_SDK_MODULE_IDS.length - 2);
  assert.equal(reviewed.authentication.mode, "required");
  assert.throws(
    () => updateGameSdkModuleProfile(initial, {
      authorization: {
        mode: "disabled",
        reason: "解除",
      },
    }),
    /GAME_SDK_MODULE_PLATFORM_LOCKED/,
  );
});

test("only the linked human owner route can mutate module requirements", () => {
  const route = read(
    "apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/modules/route.ts",
  );
  assert.match(route, /getSdkAccountPlayerId/);
  assert.match(route, /authenticateCreatorOwner/);
  assert.match(route, /updateCreatorGameModuleProfile/);
  assert.doesNotMatch(route, /Bearer/);

  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  assert.match(mcp, /get_game_module_requirements/);
  assert.match(mcp, /requiredModuleIds:\s*requiredGameSdkModuleIds/);
  assert.doesNotMatch(mcp, /classification:/);
  assert.doesNotMatch(mcp, /\n\s+moduleProfile,\n/);
  assert.match(mcp, /editableByAi:\s*false/);
  assert.doesNotMatch(
    mcp,
    /name:\s*"set_game_module_requirements"/,
  );
});

test("both mock publishing paths attach the all-required profile on first insert", () => {
  const api = read(
    "apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/mock/route.ts",
  );
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  for (const source of [api, mcp]) {
    assert.match(source, /createInitialGameSdkModuleProfile/);
    assert.match(source, /module_policy/);
    assert.doesNotMatch(
      source,
      /ON CONFLICT[\s\S]{0,500}module_policy\s*=\s*EXCLUDED\.module_policy/,
    );
  }
});

test("creator AI receives only the current all-required contract", () => {
  const aiFacingSources = [
    read("sdk/entry/START_GAME_FIELDS.md"),
    read("sdk/starter-template/AGENTS.md"),
    read("sdk/starter-template/SDK_API.md"),
    read("sdk/starter-template/SDK_MODULE_CATALOG.md"),
    read("packages/game-sdk/README.md"),
  ];
  for (const source of aiFacingSources) {
    assert.match(source, /全.*必須|requiredModuleIds/);
    assert.doesNotMatch(
      source,
      /解除可|任意へ|必須解除|理由付き解除|humanReviewable|classification\./,
    );
  }
});

test("SDK dev preview exposes the owner-only module review surface", () => {
  const page = read(
    "apps/sdk-portal/app/[instanceId]/games/[gameId]/page.tsx",
  );
  const review = read(
    "apps/sdk-portal/app/[instanceId]/games/[gameId]/GameModuleReview.tsx",
  );
  assert.match(page, /authenticateCreatorOwner/);
  assert.match(page, /getCreatorModuleCustomizationAccess/);
  assert.match(page, /GameModuleReview/);
  assert.match(review, /HUMAN REVIEW ONLY/);
  assert.match(review, /制作GPTには確定後の必須一覧だけを渡します/);
  assert.match(review, /GAME_SDK_MODULE_CATALOG/);
  assert.match(review, /canCustomize/);

  const route = read(
    "apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/modules/route.ts",
  );
  assert.match(route, /getCreatorModuleCustomizationAccess/);
  assert.match(route, /customization_not_available/);
  assert.match(route, /status:\s*402/);
});
