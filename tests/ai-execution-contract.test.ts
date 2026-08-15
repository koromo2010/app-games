import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("execution rules separate product writes, recovery, checkpoints and formal results", () => {
  const rules = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  assert.match(rules, /外部call回数、logical product write件数、control-plane write件数を混同しない/);
  assert.match(rules, /logical product write/);
  assert.match(rules, /control-plane write/);
  assert.match(rules, /同じrequest ID・同じ意味内容による冪等replay.*二件目のlogical product writeではない/);
  assert.match(rules, /Git push、Deployment、checkpoint保存はlogical product write件数へ含めず/);
  assert.match(rules, /tool名、schema、response path、parser、binding/);
  assert.match(rules, /通常のGit push承認待ち.*正式resultを作るterminal boundaryにはしない/);
  assert.match(rules, /Portal owner承認/);
  assert.match(rules, /remote未到達のままturnを終える場合は下記耐久checkpoint/);
  assert.match(rules, /canonical Git、checkpoint正本、共有済み領域、Library、current pointer/);
  assert.match(rules, /取得経路、対象DeploymentまたはURL、identity、取得時刻/);
});

test("troubleshooting fixes the MCP response paths and proposal reconciliation", () => {
  const troubleshooting = read("docs/AI_EXECUTION_TROUBLESHOOTING.md");
  assert.match(troubleshooting, /`structuredContent\.environmentBinding`/);
  assert.match(troubleshooting, /`structuredContent\.proposal\.id`/);
  assert.match(troubleshooting, /`structuredContent\.sdkIdentity`/);
  assert.match(troubleshooting, /`isError`を先に判定/);
  assert.match(troubleshooting, /同じtool flow/);
  assert.match(troubleshooting, /別request IDや二件目proposalを作らない/);
  assert.match(troubleshooting, /同一request ID・同一payloadで`prepare_module_profile_update`を冪等replay/);
  assert.match(troubleshooting, /`get_game_module_profile_proposal`をrequest IDで呼ばない/);
  assert.match(troubleshooting, /DevTools操作やスクリーンショットが反復/);
});

test("handshake documentation matches the implemented request and aggregate verdict", () => {
  const documentation = read("docs/SDK_HANDSHAKE.md");
  const implementation = read("packages/game-sdk/src/handshake.ts");
  const authoringContract = JSON.parse(read("config/sdk-authoring-contract.json"));
  assert.match(documentation, /"name": "ChatGPT Work"/);
  assert.match(documentation, /"canonicalMcpUrl": "https:\/\/sdk-dev\.game-fields\.com\/api\/mcp"/);
  assert.match(documentation, /"onboardingProfileId": "game-fields-development-authoring-v1"/);
  assert.match(documentation, /`accepted`は`problems\.length === 0`から生成されるaggregate verdict/);
  assert.match(documentation, /`accepted=false`だけを正式resultのterminal boundaryにしない/);
  assert.match(implementation, /accepted: problems\.length === 0/);
  assert.match(implementation, /"ChatGPT Work",\s*"Claude Code"/);
  assert.ok(authoringContract.invariants.must.some((rule: string) => (
    rule.includes("post-handshake SDK response")
    && rule.includes("handshake response itself")
  )));
});

test("DownloadMe parses one handshake verdict and reads proposals back before Portal wait", () => {
  const entry = read("sdk/entry/START_GAME_FIELDS.md");
  assert.match(entry, /SET HANDSHAKE := MCP_RESULT\.structuredContent/);
  assert.match(entry, /HANDSHAKE\.accepted != true/);
  assert.match(entry, /HANDSHAKE\.environmentBinding/);
  assert.match(entry, /MCP_RESULT\.content contains exactly one JSON text item/);
  assert.match(entry, /CLASSIFY HANDSHAKE\.problems\[\*\]\.code/);
  assert.match(entry, /HALT on the true compatibility blocker/);
  assert.doesNotMatch(entry, /IF HANDSHAKE\.accepted != true:\n\s+EMIT C1\.HANDSHAKE_FAILURE_PREFIX[^\n]*\n\s+HALT\./);
  assert.doesNotMatch(entry, /ASSERT response\.accepted == true/);
  assert.doesNotMatch(entry, /ASSERT response\.environment == C0\.release\.environment/);
  assert.match(entry, /CALL get_game_module_profile_proposal/);
  assert.match(entry, /proposalId: PREPARED_PROPOSAL\.proposal\.id/);
  assert.match(entry, /PROPOSAL_READBACK\.proposal\.requestId == MODULE_PROPOSAL_REQUEST_ID/);
  assert.match(entry, /PROPOSAL_READBACK\.activeProfileChanged == false/);
  assert.match(entry, /identical frozen MODULE_PROPOSAL_PAYLOAD/);
  assert.match(entry, /HALT without a new requestId or second logical proposal/);
});

test("Claude Code profile uses the same aggregate verdict and proposal read-back contract", () => {
  const profile = read("sdk/entry/START_CLAUDE_CODE.md");
  assert.match(profile, /`accepted=true` is the aggregate verdict/);
  assert.match(profile, /`structuredContent\.environmentBinding`/);
  assert.match(profile, /`structuredContent\.sdkIdentity`/);
  assert.match(profile, /`structuredContent\.proposal\.id`/);
  assert.match(profile, /`get_game_module_profile_proposal` in the same tool flow/);
  assert.match(profile, /`activeProfileChanged=false`/);
  assert.match(profile, /`humanApprovalRequired=true`/);
  assert.match(profile, /canonical MCP URL, release, or onboarding profile mismatches/);
  assert.match(profile, /same frozen requestId and identical semantic payload/);
  assert.doesNotMatch(profile, /Require `accepted=true`, `problems=\[\]`, and exact matches/);
});

test("current SDK specifications name the supported clients and do not recheck an accepted handshake", () => {
  const agents = read("AGENTS.md");
  const navigation = read("docs/README.md");
  const handoff = read("docs/DEVELOPMENT_HANDOFF.md");
  const external = read("docs/EXTERNAL_GAME_PACKAGE.md");
  const overview = read("docs/CHATGPT_GAME_SDK.md");
  for (const document of [handoff, external, overview]) {
    assert.doesNotMatch(document, /Codex/);
  }
  assert.match(handoff, /ChatGPT WorkとClaude Code/);
  assert.match(agents, /`sdk\/entry\/START_CLAUDE_CODE\.md`/);
  assert.match(navigation, /`sdk\/entry\/START_CLAUDE_CODE\.md`/);
  assert.match(handoff, /`accepted=true`をaggregate verdictとして採用/);
  assert.doesNotMatch(handoff, /`accepted=true`とcanonical endpoint一致を確認/);
  assert.match(overview, /handshake response自体にはpost-handshake用`sdkIdentity`を要求しない/);
});
