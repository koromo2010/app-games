import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MODULE_PROFILE_PROPOSAL_STORE_ERROR,
  MODULE_PROFILE_STATUS_STORE_ERROR,
  ModuleProfileProposalStoreError,
  ModuleProfileStatusStoreError,
  findCreatorGameModuleProfileProposalId,
  resolveExistingModuleProfileProposal,
  resolveCreatorGameModuleProfileUpdateStatus,
} from "../apps/sdk-portal/lib/module-profile-proposal-store.ts";
import { handleModuleProfileStatus } from "../apps/sdk-portal/lib/module-profile-status-handler.ts";
import { buildSdkToolErrorResult } from "../apps/sdk-portal/lib/sdk-tool-error-contract.ts";

const read = (path: string) => readFileSync(path, "utf8");

test("module profile proposal flow exposes preparation and readback but no AI approval", () => {
  const route = read("apps/sdk-portal/app/api/mcp/route.ts");
  assert.match(route, /name: "prepare_module_profile_update"/);
  assert.match(route, /name: "get_game_module_profile_proposal"/);
  assert.match(route, /activeProfileChanged: false/);
  assert.match(route, /humanApprovalRequired: true/);
  assert.match(route, /reviewUrl/);
  assert.doesNotMatch(route, /name: "approve_game_module_profile_proposal"/);
});

test("requestId status lookup requires binding and uses allowlisted structured errors", () => {
  const route = read("apps/sdk-portal/app/api/mcp/route.ts");
  const store = read("apps/sdk-portal/lib/module-profile-proposal-store.ts");
  assert.match(route, /name: "get_module_update_status"/);
  assert.match(route, /readOnlyHint: true/);
  assert.match(route, /environmentBinding/);
  assert.match(route, /handleModuleProfileStatus\(/);
  assert.match(read("apps/sdk-portal/lib/module-profile-status-handler.ts"), /proposalWriteAuthorized: input\.scope\.split\(" "\)\.includes\("sdk:mock"\)/);
  assert.match(read("apps/sdk-portal/lib/sdk-tool-error-contract.ts"), /structuredContent: \{ error \}/);
  assert.match(route, /SDK_MOCK_SCOPE_REQUIRED/);
  assert.match(route, /GAME_SDK_PROPOSAL_INPUT_INVALID/);
  assert.match(route, /SDK_OPERATION_FAILED/);
  assert.doesNotMatch(route, /knownCode = .*match/);
  assert.doesNotMatch(route, /structuredContent: \{ error: .*stack/);
  assert.match(store, /getCreatorGameModuleProfileUpdateStatus/);
  assert.ok(store.includes("p.request_id = " + String.fromCharCode(36) + "{input.requestId}::uuid"));
});

test("short proposal name is published once while the legacy name remains accepted", () => {
  const route = read("apps/sdk-portal/app/api/mcp/route.ts");
  const publishedTools = route.slice(
    route.indexOf("const baseTools = ["),
    route.indexOf("type ToolDefinition"),
  );
  assert.match(route, /const prepareModuleProfileUpdateToolDefinition =/);
  assert.match(route, /const prepareModuleProfileUpdateToolNames = new Set\(\[\s*"prepare_game_module_profile_update",\s*"prepare_module_profile_update",/);
  assert.doesNotMatch(publishedTools, /name: "prepare_game_module_profile_update"/);
  assert.match(publishedTools, /name: "prepare_module_profile_update", \.\.\.prepareModuleProfileUpdateToolDefinition/);
  assert.equal(
    [...publishedTools.matchAll(/name: "prepare_(?:game_)?module_profile_update"/g)].length,
    1,
  );
  assert.match(route, /prepareModuleProfileUpdateToolNames\.has\(name\)/);
  assert.match(route, /\.\.\.prepareModuleProfileUpdateToolNames/);
  assert.match(route, /environmentBinding: environmentBindingSchema/);
  assert.match(route, /prepareCreatorGameModuleProfileUpdate\(\{/);
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
  assert.match(store, /moduleProfileProposalCompatibility\(proposal\) !== "compatible"/);
  assert.match(store, /mock_approved_revision = NULL/);
  assert.match(store, /prototype_module_contract_digest = NULL/);
  assert.match(store, /actor_kind,\s*actor_player_id/);
  assert.match(store, /moduleProfileProposalActor/);
  assert.match(store, /proposerClient !== "Portal Owner"/);
});

test("Portal proposal route is owner-only and requires explicit confirmation", () => {
  const route = read("apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/module-proposals/[proposalId]/route.ts");
  assert.match(route, /authenticateCreatorOwner/);
  assert.match(route, /owner_required/);
  assert.match(route, /body\?\.confirm !== true/);
  assert.match(route, /approveCreatorGameModuleProfileProposal/);
  assert.match(route, /updateCreatorGameModuleProfileProposal/);
});

test("status lookup executes the injected store seam and returns existing proposal fields", async () => {
  const calls: string[] = [];
  const proposal = {
    id: "proposal-1",
    baseModuleProfileRevision: "revision-1",
    baseModuleContractDigest: "digest-1",
    status: "pending",
    diff: [{ id: "ads", before: { mode: "required" }, after: { mode: "disabled" }, reason: "no ads" }],
  } as never;
  const result = await resolveCreatorGameModuleProfileUpdateStatus(
    { creatorId: "creator-1", gameId: "twixt-repro", requestId: "request-1" },
    {
      ensureSchema: async () => { calls.push("ensureSchema"); },
      findProposalId: async () => { calls.push("findProposalId"); return "proposal-1"; },
      loadProposal: async () => { calls.push("loadProposal"); return proposal; },
    },
  );
  assert.deepEqual(calls, ["ensureSchema", "findProposalId", "loadProposal"]);
  assert.equal(result?.id, "proposal-1");
  assert.equal(result?.status, "pending");
  assert.equal(result?.baseModuleProfileRevision, "revision-1");
  assert.equal(result?.baseModuleContractDigest, "digest-1");
  assert.equal(result?.diff[0]?.id, "ads");
});

test("status lookup returns an absent result without invoking proposal loading", async () => {
  let loadCalls = 0;
  const result = await resolveCreatorGameModuleProfileUpdateStatus(
    { creatorId: "creator-1", gameId: "twixt-repro", requestId: "request-absent" },
    {
      ensureSchema: async () => {},
      findProposalId: async () => null,
      loadProposal: async () => { loadCalls += 1; return null; },
    },
  );
  assert.equal(result, null);
  assert.equal(loadCalls, 0);
});

test("status and prepare share one typed canonical proposal lookup", async () => {
  let query = "";
  let values: unknown[] = [];
  const result = await findCreatorGameModuleProfileProposalId(
    { creatorId: "creator-1", gameId: "twixt-repro", requestId: "request-absent" },
    async (strings, ...queryValues) => {
      query = strings.join("?");
      values = queryValues;
      return [];
    },
  );
  assert.equal(result, null);
  assert.match(query, /p\.creator_id = \?::uuid/);
  assert.match(query, /g\.game_id = \?/);
  assert.match(query, /p\.request_id = \?::uuid/);
  assert.deepEqual(values, ["creator-1", "twixt-repro", "request-absent"]);
});

test("status lookup converts store failures to a sanitized stable error", async () => {
  await assert.rejects(
    resolveCreatorGameModuleProfileUpdateStatus(
      { creatorId: "creator-1", gameId: "twixt-repro", requestId: "request-error" },
      {
        ensureSchema: async () => {},
        findProposalId: async () => { throw new Error("SQL secret-token stack trace"); },
        loadProposal: async () => null,
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ModuleProfileStatusStoreError);
      assert.equal((error as Error).message, MODULE_PROFILE_STATUS_STORE_ERROR.code);
      assert.doesNotMatch((error as Error).message, /SQL|secret-token|stack trace/);
      assert.equal(MODULE_PROFILE_STATUS_STORE_ERROR.message, "module update status is temporarily unavailable.");
      assert.equal(MODULE_PROFILE_STATUS_STORE_ERROR.layer, "store");
      return true;
    },
  );
});

test("status lookup seam never performs proposal writes", async () => {
  const writes: string[] = [];
  await resolveCreatorGameModuleProfileUpdateStatus(
    { creatorId: "creator-1", gameId: "twixt-repro", requestId: "request-absent" },
    {
      ensureSchema: async () => {},
      findProposalId: async () => null,
      loadProposal: async () => { writes.push("proposal-load"); return null; },
    },
  );
  assert.deepEqual(writes, []);
});

test("status handler covers validation, owner, scope and common binding boundaries at runtime", async () => {
  let lookupCalls = 0;
  const base = {
    gameId: "twixt-repro",
    requestId: "9f4d7c4e-4f3b-4a7d-9c4a-2a7e2b6d8f10",
    scope: "sdk:creator",
    slug: "test10-1",
  };
  const existing = {
    id: "proposal-1", requestId: base.requestId, status: "pending",
    baseModuleProfileRevision: "revision-1", baseModuleContractDigest: "digest-1",
    diff: [],
  } as never;
  const dependencies = {
    verifyBinding: () => {},
    authenticateOwner: async () => ({ id: "creator-1" }),
    lookupStatus: async () => { lookupCalls += 1; return existing; },
  };
  const result = await handleModuleProfileStatus(base, dependencies);
  assert.equal(result.proposalExists, true);
  assert.equal(result.proposalWriteAuthorized, false);
  assert.equal(result.activeProfileChanged, false);
  assert.equal(result.proposalId, "proposal-1");
  assert.equal(result.proposalCompatible, false);
  assert.equal("diff" in result, false);
  assert.equal("requestId" in result, false);
  await assert.rejects(handleModuleProfileStatus({ ...base, gameId: "BAD!" }, dependencies), /GAME_SDK_PROPOSAL_INPUT_INVALID/);
  await assert.rejects(handleModuleProfileStatus({ ...base, requestId: "not-a-uuid" }, dependencies), /GAME_SDK_PROPOSAL_INPUT_INVALID/);
  await assert.rejects(handleModuleProfileStatus(base, { ...dependencies, authenticateOwner: async () => null }), /SDK_OWNER_REQUIRED/);
  await assert.rejects(handleModuleProfileStatus(base, { ...dependencies, verifyBinding: () => { throw new Error("SDK_ENVIRONMENT_BINDING_REQUIRED"); } }), /SDK_ENVIRONMENT_BINDING_REQUIRED/);
  assert.equal(lookupCalls, 1);
});

test("status error wrapper is structured and sanitized at runtime", () => {
  const result = buildSdkToolErrorResult({
    code: "SDK_MODULE_UPDATE_STATUS_UNAVAILABLE",
    message: "module update status is temporarily unavailable.",
    layer: "store",
  });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, "SDK_MODULE_UPDATE_STATUS_UNAVAILABLE");
  assert.equal(result.structuredContent.error.layer, "store");
  assert.equal(result.content[0].text, "module update status is temporarily unavailable.");
  assert.doesNotMatch(JSON.stringify(result), /SQL|internal-token|stack trace/);
});

test("proposal store error exposes only a stable code, layer and safe correlation id", () => {
  const error = new ModuleProfileProposalStoreError("mpp-0123456789abcdef", "proposal-insert");
  const result = buildSdkToolErrorResult({
    code: MODULE_PROFILE_PROPOSAL_STORE_ERROR.code,
    message: MODULE_PROFILE_PROPOSAL_STORE_ERROR.message,
    layer: MODULE_PROFILE_PROPOSAL_STORE_ERROR.layer,
    correlationId: error.correlationId,
    operation: error.operation,
  });
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent.error, {
    code: "SDK_MODULE_PROPOSAL_STORE_UNAVAILABLE",
    message: "module profile proposal is temporarily unavailable.",
    layer: "store",
    correlationId: "mpp-0123456789abcdef",
    operation: "proposal-insert",
  });
  assert.doesNotMatch(JSON.stringify(result), /SQL|secret-token|stack trace|requestId/);
});

test("proposal store boundaries identify only the safe failing operation", () => {
  const store = read("apps/sdk-portal/lib/module-profile-proposal-store.ts");
  for (const operation of [
    "schema",
    "proposal-lookup",
    "authoring-state",
    "proposal-insert",
    "audit-insert",
    "proposal-readback",
  ]) {
    assert.match(store, new RegExp(`\\"${operation}\\"`));
  }
  assert.doesNotMatch(store, /SDK_DATABASE_URL|POSTGRES_PRISMA_URL|DATABASE_URL/);
});

test("proposal preparation keeps the existing requestId idempotent without a second generator", async () => {
  let loadCalls = 0;
  const result = await resolveExistingModuleProfileProposal(
    { creatorId: "creator-1", gameId: "twixt-repro", requestId: "request-1" },
    {
      findProposalId: async () => "proposal-1",
      loadProposal: async (proposalId) => { loadCalls += 1; return { id: proposalId } as never; },
    },
  );
  assert.equal(result?.id, "proposal-1");
  assert.equal(loadCalls, 1);
});
