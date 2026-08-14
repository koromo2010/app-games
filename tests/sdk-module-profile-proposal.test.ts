import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("module profile proposal flow exposes preparation and readback but no AI approval", () => {
  const route = read("apps/sdk-portal/app/api/mcp/route.ts");
  assert.match(route, /name: "prepare_game_module_profile_update"/);
  assert.match(route, /name: "get_game_module_profile_proposal"/);
  assert.match(route, /activeProfileChanged: false/);
  assert.match(route, /humanApprovalRequired: true/);
  assert.match(route, /reviewUrl/);
  assert.doesNotMatch(route, /name: "approve_game_module_profile_proposal"/);
});

test("proposal persistence binds the base revision and digest and approval clears prototype approval", () => {
  const store = read("apps/sdk-portal/lib/module-profile-proposal-store.ts");
  const migration = read("db/sdk/009_module_profile_proposals.sql");
  assert.match(migration, /request_id UUID NOT NULL/);
  assert.match(migration, /base_module_profile_revision UUID NOT NULL/);
  assert.match(migration, /base_module_contract_digest CHAR\(64\) NOT NULL/);
  assert.match(migration, /status VARCHAR\(16\)/);
  assert.match(store, /GAME_SDK_PROPOSAL_NOOP/);
  assert.match(store, /MODULE_PROFILE_STALE/);
  assert.match(store, /proposal\.catalogDigest !== moduleCatalogDigest\(\)/);
  assert.match(store, /mock_approved_revision = NULL/);
  assert.match(store, /prototype_module_contract_digest = NULL/);
  assert.match(store, /actor_kind, actor_player_id/);
});

test("Portal proposal route is owner-only and requires explicit confirmation", () => {
  const route = read("apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/module-proposals/[proposalId]/route.ts");
  assert.match(route, /authenticateCreatorOwner/);
  assert.match(route, /owner_required/);
  assert.match(route, /body\?\.confirm !== true/);
  assert.match(route, /approveCreatorGameModuleProfileProposal/);
  assert.match(route, /updateCreatorGameModuleProfileProposal/);
});
