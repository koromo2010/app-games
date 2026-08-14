import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("the formal authoring surfaces are exactly ChatGPT Work and Claude Code", () => {
  const contract = JSON.parse(read("config/sdk-authoring-contract.json"));
  assert.deepEqual(contract.supportedClients.map((client: { id: string }) => client.id), [
    "chatgpt-work",
    "claude-code",
  ]);
  assert.deepEqual(contract.unsupportedClients, [
    "Claude regular chat",
    "Claude Desktop regular chat",
    "Cowork",
  ]);

  const portal = read("apps/sdk-portal/app/page.tsx");
  assert.match(portal, /ChatGPT Workで作る/);
  assert.match(portal, /Claude Codeで作る/);
  assert.match(portal, /通常のClaudeチャット/);
  assert.match(portal, /Cowork/);
  assert.doesNotMatch(portal, /Codex/);
});

test("Claude Code profile uses remote HTTP OAuth and never embeds credentials", () => {
  const profile = read("sdk/entry/START_CLAUDE_CODE.md");
  assert.match(profile, /--transport http/);
  assert.match(profile, /complete browser OAuth/);
  assert.match(profile, /localhost/);
  assert.match(profile, /https:\/\/code\.claude\.com\/docs\/en\/mcp/);
  assert.match(profile, /create_game_draft/);
  assert.match(profile, /moduleProfileRevision/);
  assert.match(profile, /prototypeRevision/);
  assert.doesNotMatch(profile, /API[_ -]?key\s*[:=]|Bearer\s+[A-Za-z0-9_-]{12,}/i);
});

test("every post-handshake MCP tool is environment-bound and authoring writes require mock scope", () => {
  const route = read("apps/sdk-portal/app/api/mcp/route.ts");
  assert.match(route, /tool\.name === "get_sdk_handshake"/);
  assert.match(route, /environmentBinding: environmentBindingSchema/);
  assert.match(route, /verifyAuthoringEnvironmentBinding/);
  assert.match(route, /sdkIdentity/);
  assert.match(route, /"create_game_draft",\s*\n\s*"prepare_game_module_profile_update",\s*\n\s*"publish_mock"/);
  assert.match(route, /includes\("sdk:mock"\)/);
});

test("development identity is visibly and semantically TEST ONLY", () => {
  const profiles = JSON.parse(read("config/sdk-release-profiles.json"));
  assert.equal(
    profiles.profiles.development.connectorDisplayName,
    "Game Fields Development — TEST ONLY",
  );
  assert.equal(
    profiles.profiles.development.toolDescriptionPrefix,
    "[DEVELOPMENT / TEST ONLY]",
  );
  assert.notEqual(
    profiles.profiles.development.portalBaseUrl,
    profiles.profiles.production.portalBaseUrl,
  );
  assert.notEqual(
    profiles.profiles.development.onboardingProfileId,
    profiles.profiles.production.onboardingProfileId,
  );
});
