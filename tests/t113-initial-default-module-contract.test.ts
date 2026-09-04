import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createInitialGameSdkModuleProfile } from "@game-fields/game-sdk/modules";
import {
  createCreatorGameDraft,
  creatorGameModuleAuthoringSummary,
  type CreatorGameModuleAuthoringState,
} from "../apps/sdk-portal/lib/module-authoring-store.ts";
import {
  moduleProfileProposalActor,
  resolveModuleProfileChange,
} from "../apps/sdk-portal/lib/module-profile-proposal-store.ts";

const read = (path: string) => readFileSync(path, "utf8");
const revision = "11111111-1111-4111-8111-111111111111";
const digest = "a".repeat(64);

function state(
  overrides: Partial<CreatorGameModuleAuthoringState> = {},
): CreatorGameModuleAuthoringState {
  return {
    creatorId: "creator-1",
    gameId: "new-game",
    moduleProfile: createInitialGameSdkModuleProfile(),
    moduleProfileRevision: revision,
    moduleContractDigest: digest,
    moduleProfileConfirmedAt: null,
    moduleProfileCreatedAt: "2026-09-04T00:00:00.000Z",
    moduleProfileUpdatedAt: "2026-09-04T00:00:00.000Z",
    pendingModuleProfileProposalId: null,
    pendingModuleProfileProposalCreatedAt: null,
    ...overrides,
  };
}

test("new draft persists the canonical default digest without a human confirmation record", async () => {
  let schemaCalls = 0;
  let query = "";
  let values: unknown[] = [];
  const created = await createCreatorGameDraft({
    creatorId: "creator-1",
    gameId: "new-game",
    title: "New Game",
    description: "default contract fixture",
    playMode: "online-room",
    minimumPlayers: 2,
    maximumPlayers: 4,
    origin: "https://sdk-dev.game-fields.com",
  }, {
    ensureSchema: async () => { schemaCalls += 1; },
    createRevision: () => revision,
    sql: async (strings, ...queryValues) => {
      query = strings.join("?");
      values = queryValues;
      return [{
        id: "game-row-1",
        gameId: "new-game",
        title: "New Game",
        description: "default contract fixture",
        moduleProfile: JSON.parse(String(queryValues[5])),
        moduleProfileRevision: revision,
        moduleContractDigest: queryValues[7],
        moduleProfileConfirmedAt: null,
        moduleProfileCreatedAt: "2026-09-04T00:00:00.000Z",
        moduleProfileUpdatedAt: "2026-09-04T00:00:00.000Z",
      }];
    },
  });

  assert.equal(schemaCalls, 1);
  assert.match(query, /module_profile_revision, module_contract_digest/);
  assert.equal((query.match(/module_contract_digest AS "moduleContractDigest"/g) ?? []).length, 1);
  assert.doesNotMatch(query.slice(0, query.indexOf("RETURNING")), /module_profile_confirmed_at/);
  assert.equal(values[6], revision);
  assert.equal(typeof values[7], "string");
  assert.equal(String(values[7]).length, 64);
  assert.equal(created.moduleContractState?.establishmentKind, "initial-default");
  assert.equal(created.moduleContractState?.origin, "system-default");
  assert.equal(created.moduleContractState?.humanConfirmationRequired, false);
  assert.equal(created.moduleContractState?.prototypeAuthoringAllowed, true);
  assert.equal(created.moduleContractState?.moduleProfileConfirmedAt, null);
  assert.deepEqual(created.moduleContractState?.auditRecord, {
    event: "initial-default-established",
    actorKind: "system",
    occurredAt: "2026-09-04T00:00:00.000Z",
  });
});

test("module contract state distinguishes initial default, human confirmation, and pending change", () => {
  const initial = creatorGameModuleAuthoringSummary(state());
  const human = creatorGameModuleAuthoringSummary(state({
    moduleProfileConfirmedAt: "2026-09-04T01:00:00.000Z",
  }));
  const pending = creatorGameModuleAuthoringSummary(state({
    moduleContractDigest: null,
    moduleProfileUpdatedAt: "2026-09-04T02:00:00.000Z",
  }));
  const pendingChange = creatorGameModuleAuthoringSummary(state({
    pendingModuleProfileProposalId: "22222222-2222-4222-8222-222222222222",
    pendingModuleProfileProposalCreatedAt: "2026-09-04T03:00:00.000Z",
  }));

  assert.equal(initial?.establishmentKind, "initial-default");
  assert.equal(initial?.auditRecord.actorKind, "system");
  assert.equal(human?.establishmentKind, "human-confirmation");
  assert.equal(human?.auditRecord.actorKind, "owner");
  assert.equal(human?.auditRecord.occurredAt, human?.moduleProfileConfirmedAt);
  assert.equal(pending?.establishmentKind, "pending-human-confirmation");
  assert.equal(pending?.humanConfirmationRequired, true);
  assert.equal(pending?.auditRecord.actorKind, null);
  assert.equal(pendingChange?.establishmentKind, "initial-default");
  assert.equal(pendingChange?.changeConfirmationState, "pending-human-confirmation");
  assert.equal(pendingChange?.humanConfirmationRequired, true);
  assert.equal(pendingChange?.prototypeAuthoringAllowed, false);
});

test("proposal audit actor distinguishes AI preparation from a real Portal owner", () => {
  assert.deepEqual(moduleProfileProposalActor({ proposerClient: "ChatGPT Work" }), {
    actorKind: "ai",
    actorPlayerId: null,
  });
  assert.deepEqual(moduleProfileProposalActor({ proposerClient: "Claude Code" }), {
    actorKind: "ai",
    actorPlayerId: null,
  });
  assert.deepEqual(moduleProfileProposalActor({
    proposerClient: "Portal Owner",
    proposerPlayerId: "player-owner-1",
  }), {
    actorKind: "owner",
    actorPlayerId: "player-owner-1",
  });
  assert.throws(
    () => moduleProfileProposalActor({ proposerClient: "Portal Owner" }),
    /GAME_SDK_PROPOSAL_OWNER_REQUIRED/,
  );
});

test("canonical-identical module decisions do not create a change", () => {
  const profile = createInitialGameSdkModuleProfile();
  const unchanged = resolveModuleProfileChange(profile, {
    vote: { mode: "required" },
    rounds: { mode: "required" },
  });
  assert.equal(unchanged.kind, "unchanged");
  assert.deepEqual(unchanged.diff, []);

  const changed = resolveModuleProfileChange(profile, {
    vote: { mode: "disabled", reason: "No voting phase" },
  });
  assert.equal(changed.kind, "changed");
  assert.deepEqual(changed.diff.map((item) => item.id), ["vote"]);
});

test("prototype gates accept established digests but keep pending changes closed", () => {
  const store = read("apps/sdk-portal/lib/module-authoring-store.ts");
  const pipeline = read("apps/sdk-portal/lib/publish-mock-pipeline.ts");
  const approval = read("apps/sdk-portal/lib/mock-approval-store.ts");
  const packageStore = read("apps/sdk-portal/lib/game-package-store.ts");
  const submit = read("apps/sdk-portal/app/api/dashboard/games/[instanceId]/[gameId]/submit/route.ts");

  assert.match(store, /if \(!state\.moduleContractDigest \|\| state\.pendingModuleProfileProposalId\)/);
  assert.doesNotMatch(store, /if \(!state\.moduleProfileConfirmedAt \|\| !state\.moduleContractDigest\)/);
  for (const source of [pipeline, approval, submit]) {
    assert.match(source, /module_contract_digest IS NOT NULL/);
    assert.doesNotMatch(source, /module_profile_confirmed_at IS NOT NULL/);
  }
  for (const source of [pipeline, approval, packageStore, submit]) {
    assert.match(source, /sdk_game_module_profile_proposals/);
    assert.match(source, /p\.status = 'pending'/);
    assert.match(source, /NOT EXISTS/);
  }
});

test("API, Portal, and guidance distinguish system default from human confirmation", () => {
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  const portal = read("apps/sdk-portal/app/[instanceId]/games/[gameId]/GameModuleReview.tsx");
  const proposalStore = read("apps/sdk-portal/lib/module-profile-proposal-store.ts");
  const guidance = [
    read("config/sdk-authoring-contract.json"),
    read("sdk/entry/START_GAME_FIELDS.md"),
    read("sdk/entry/START_CLAUDE_CODE.md"),
    read("sdk/starter-template/SDK_API.md"),
  ].join("\n");

  assert.match(mcp, /humanConfirmationRequired: false/);
  assert.match(mcp, /moduleContractState: draft\.moduleContractState/);
  assert.match(mcp, /preparation\.kind === "unchanged"/);
  assert.match(portal, /初期デフォルトで自動確定/);
  assert.match(portal, /人間が明示確定済み/);
  assert.match(portal, /module変更の人間確認待ち/);
  assert.match(portal, /module変更案を作成/);
  assert.match(proposalStore, /proposerClient: "ChatGPT Work" \| "Claude Code" \| "Portal Owner"/);
  assert.match(guidance, /system-default/);
  assert.match(guidance, /initial-default/);
  assert.match(guidance, /人間確認済み/);
});

test("later human approval boundaries and no-migration constraint remain intact", () => {
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  const proposalRoute = read("apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/module-proposals/[proposalId]/route.ts");
  const changes = read("apps/sdk-portal/lib/module-profile-proposal-store.ts");

  assert.match(proposalRoute, /body\?\.confirm !== true/);
  assert.match(proposalRoute, /approveCreatorGameModuleProfileProposal/);
  assert.match(changes, /proposerClient !== "Portal Owner"/);
  assert.match(changes, /actorKind: "ai"/);
  assert.match(changes, /'approved', 'owner'/);
  assert.match(mcp, /args\.humanApproved !== true/);
  assert.match(mcp, /requireApprovedCreatorMock/);
  assert.doesNotMatch(changes, /UPDATE[\s\S]*sdk_games[\s\S]*WHERE[\s\S]*module_contract_digest IS NULL[\s\S]*initial-default/i);
  assert.equal(read("apps/sdk-portal/lib/sdk-postgres.ts").includes("SDK_SCHEMA_VERSION = 12"), false);
});
