import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GAME_SDK_CREATOR_CONFIGURABLE_MODULE_IDS,
  GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG,
  GAME_SDK_MODULE_CATALOG,
  GAME_SDK_MODULE_GOVERNANCE,
  GAME_SDK_MODULE_IDS,
  GAME_SDK_PACKAGE_MODULE_IDS,
  GAME_SDK_PLAYER_VISIBLE_MODULE_CATALOG,
  GAME_SDK_PLATFORM_RUNTIME_MODULE_IDS,
  GAME_SDK_PROPOSAL_ELIGIBLE_MODULE_IDS,
  createInitialGameSdkModuleProfile,
  creatorVisibleGameSdkModuleProfile,
  gameSdkModuleIsRequired,
  normalizeGameSdkModuleProfile,
  playerVisibleGameSdkModuleProfile,
  updateGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import { createGameSdkModuleContract } from "../apps/sdk-portal/lib/module-authoring-contract.ts";
import {
  creatorModuleProfileProposalView,
  moduleCatalogDigest,
  type ModuleProfileProposal,
} from "../apps/sdk-portal/lib/module-profile-proposal-store.ts";

const read = (path: string) => readFileSync(path, "utf8");

function proposal(
  overrides: Partial<ModuleProfileProposal>,
): ModuleProfileProposal {
  const profile = createInitialGameSdkModuleProfile();
  return {
    id: "92257aed-dff9-4608-bd39-463b6885fa22",
    creatorId: "creator-id",
    gameId: "twixt-repro",
    proposerClient: "ChatGPT Work",
    environment: "development",
    requestId: "9f4d7c4e-4f3b-4a7d-9c4a-2a7e2b6d8f10",
    baseModuleProfileRevision: "11111111-1111-4111-8111-111111111111",
    baseModuleContractDigest: "a".repeat(64),
    catalogDigest: moduleCatalogDigest(),
    specification: { title: "Twixt Repro", coreLoop: "Connect two sides." },
    proposedProfile: profile,
    diff: [],
    dependencies: [],
    impact: [],
    warnings: [],
    status: "pending",
    approvedByPlayerId: null,
    approvedAt: null,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

test("all 39 modules have exhaustive orthogonal governance metadata", () => {
  assert.equal(GAME_SDK_MODULE_IDS.length, 39);
  assert.deepEqual(Object.keys(GAME_SDK_MODULE_GOVERNANCE), [...GAME_SDK_MODULE_IDS]);
  assert.equal(GAME_SDK_MODULE_CATALOG.length, 39);
  for (const definition of GAME_SDK_MODULE_CATALOG) {
    assert.deepEqual(
      {
        authority: definition.authority,
        creatorVisibility: definition.creatorVisibility,
        creatorMutability: definition.creatorMutability,
        playerVisibility: definition.playerVisibility,
        playerMutability: definition.playerMutability,
        proposalEligible: definition.proposalEligible,
        packageTreatment: definition.packageTreatment,
        runtimePolicySource: definition.runtimePolicySource,
      },
      GAME_SDK_MODULE_GOVERNANCE[definition.id],
    );
  }
  assert.equal(GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG.length, 25);
  assert.equal(GAME_SDK_PLAYER_VISIBLE_MODULE_CATALOG.length, 28);
  assert.equal(GAME_SDK_CREATOR_CONFIGURABLE_MODULE_IDS.length, 19);
  assert.equal(GAME_SDK_PROPOSAL_ELIGIBLE_MODULE_IDS.length, 19);
  assert.equal(GAME_SDK_PACKAGE_MODULE_IDS.length, 15);
  assert.equal(GAME_SDK_PLATFORM_RUNTIME_MODULE_IDS.length, 14);
});

test("the platform advertising policy is hidden, immutable, non-proposable and package-excluded", () => {
  assert.deepEqual(GAME_SDK_MODULE_GOVERNANCE.ads, {
    authority: "platform",
    creatorVisibility: "hidden",
    creatorMutability: "none",
    playerVisibility: "hidden",
    playerMutability: "none",
    proposalEligible: false,
    packageTreatment: "excluded",
    runtimePolicySource: "platform-policy",
  });
  assert.equal(
    GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG.some(({ id }) => id === "ads"),
    false,
  );
  assert.equal(GAME_SDK_PACKAGE_MODULE_IDS.includes("ads"), false);
});

test("creator projections and update guards fail closed without an ID oracle", () => {
  const initial = createInitialGameSdkModuleProfile();
  const projected = creatorVisibleGameSdkModuleProfile(initial);
  assert.equal(Object.keys(projected).length, 25);
  assert.equal("ads" in projected, false);
  assert.throws(() => updateGameSdkModuleProfile(initial, {
    ads: { mode: "disabled", reason: "not requested" },
  }), /GAME_SDK_MODULE_CHANGE_NOT_ALLOWED/);
  assert.throws(() => updateGameSdkModuleProfile(initial, {
    "guessed-internal-id": { mode: "disabled", reason: "probe" },
  }), /GAME_SDK_MODULE_CHANGE_NOT_ALLOWED/);
});

test("player transport projection omits player-hidden runtime policy", () => {
  const projected = playerVisibleGameSdkModuleProfile(
    createInitialGameSdkModuleProfile(),
  );
  assert.equal(Object.keys(projected).length, 28);
  assert.equal("ads" in projected, false);
  assert.equal("authentication" in projected, false);
  assert.equal("start-guard" in projected, false);
  assert.equal("common-navigation" in projected, true);
  assert.equal("vote" in projected, true);
});

test("legacy creator decisions cannot disable platform runtime policy", () => {
  const legacy = {
    ...createInitialGameSdkModuleProfile(),
    ads: { mode: "disabled", reason: "legacy decision" },
  };
  const normalized = normalizeGameSdkModuleProfile(legacy);
  assert.deepEqual(normalized.ads, { mode: "required" });
  assert.equal(gameSdkModuleIsRequired(legacy, "ads"), true);
});

test("authoring contracts include package-governed modules only", () => {
  const contract = createGameSdkModuleContract({
    moduleProfile: createInitialGameSdkModuleProfile(),
    moduleProfileRevision: "11111111-1111-4111-8111-111111111111",
    origin: "https://dev.sdk.game-fields.com",
  });
  assert.deepEqual(contract.requiredModuleIds, GAME_SDK_PACKAGE_MODULE_IDS);
  assert.equal(contract.requiredModules.some(({ id }) => id === "ads"), false);
  assert.equal(contract.requiredModules.some(({ id }) => id === "authentication"), false);
  assert.deepEqual(contract.disabledModuleIds, []);
});

test("legacy hidden-module proposals retain lifecycle identity but suppress detail and approval", () => {
  const legacy = proposal({
    catalogDigest: "legacy-catalog-digest",
    specification: { title: "Twixt Repro", coreLoop: "Internal decision." },
    diff: [{
      id: "ads",
      before: { mode: "required" },
      after: { mode: "disabled", reason: "legacy decision" },
      reason: "legacy decision",
    }],
  });
  const view = creatorModuleProfileProposalView(legacy);
  assert.equal(view.id, legacy.id);
  assert.equal(view.status, "pending");
  assert.equal(view.compatibilityState, "legacy-incompatible");
  assert.equal(view.approvalAllowed, false);
  assert.equal(view.activeProfileChanged, false);
  assert.deepEqual(view.specification, {});
  assert.deepEqual(view.diff, []);
  assert.deepEqual(view.impact, []);
});

test("current eligible proposals expose only their creator-visible decision", () => {
  const current = createInitialGameSdkModuleProfile();
  const proposed = updateGameSdkModuleProfile(current, {
    vote: { mode: "disabled", reason: "This game has no voting phase." },
  });
  const view = creatorModuleProfileProposalView(proposal({
    proposedProfile: proposed,
    diff: [{
      id: "vote",
      before: { mode: "required" },
      after: { mode: "disabled", reason: "This game has no voting phase." },
      reason: "This game has no voting phase.",
    }],
  }));
  assert.equal(view.compatibilityState, "compatible");
  assert.equal(view.approvalAllowed, true);
  assert.deepEqual(view.diff.map(({ id }) => id), ["vote"]);
});

test("creator-facing source and DownloadMe use derived projections without hidden policy text", () => {
  const creatorSources = [
    read("apps/sdk-portal/app/[instanceId]/games/[gameId]/GameModuleReview.tsx"),
    read("apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/modules/route.ts"),
    read("sdk/starter-template/SDK_MODULE_CATALOG.md"),
    read("sdk/starter-template/SDK_API.md"),
  ].join("\n");
  assert.match(creatorSources, /GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG/);
  assert.doesNotMatch(creatorSources, /広告枠|\bads\b|39件|全39/);

  const runtime = read("app/components/game-sdk/GameSdkFrameView.tsx");
  assert.match(runtime, /moduleRequired\("ads"\)/);

  const preview = read("app/sdk-preview/[creatorSlug]/games/[gameId]/SdkPreviewGameShell.tsx");
  assert.match(preview, /GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG/);
  assert.doesNotMatch(preview, /GAME_SDK_MODULE_IDS/);
  assert.match(preview, /visibleResolvedModuleCount/);

  const playerPage = read("app/sdk-games/[gameId]/page.tsx");
  const previewPage = read("app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx");
  const previewCatalog = read(
    "apps/sdk-portal/app/api/preview-catalog/[instanceId]/route.ts",
  );
  assert.match(playerPage, /playerVisibleGameSdkModuleProfile/);
  assert.match(previewPage, /creatorVisibleGameSdkModuleProfile/);
  assert.doesNotMatch(previewCatalog, /moduleProfile|modulePolicy/);
});

test("all creator proposal and profile boundaries apply sanitized views", () => {
  const modulesRoute = read(
    "apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/modules/route.ts",
  );
  assert.match(modulesRoute, /GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG/);
  assert.match(modulesRoute, /creatorGameModuleAuthoringSummary/);
  assert.doesNotMatch(modulesRoute, /catalog: GAME_SDK_MODULE_CATALOG/);

  const proposalRoute = read(
    "apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/module-proposals/[proposalId]/route.ts",
  );
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  const status = read("apps/sdk-portal/lib/module-profile-status-handler.ts");
  for (const boundary of [proposalRoute, mcp]) {
    assert.match(boundary, /creatorModuleProfileProposalView/);
    assert.match(boundary, /creatorModuleProfileProposalAuditView/);
  }
  assert.match(status, /moduleProfileProposalCompatibility/);
  assert.doesNotMatch(status, /diff: proposal\.diff|requestId: proposal\.requestId/);
});
