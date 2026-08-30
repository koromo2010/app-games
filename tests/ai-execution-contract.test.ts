import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  checkCanonicalDevelopmentPolicy,
  validateDevelopmentArtifact,
} from "../scripts/check-development-artifact-policy.mjs";

const read = (path: string) => readFileSync(path, "utf8");

test("execution policy is a compact decision kernel with routed runbooks", () => {
  const agents = read("AGENTS.md");
  const root = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const runbooks = [
    read("docs/DEVELOPMENT_DELIVERY_RUNBOOK.md"),
    read("docs/DEVELOPMENT_RECORDS_RUNBOOK.md"),
    read("docs/AUDIT_THREAD_RULES.md"),
  ];
  const reference = read("docs/AI_EXECUTION_TROUBLESHOOTING.md");

  assert.match(root, /## 2\. Decision kernel/);
  assert.match(root, /## 3\. Task contractと成果物/);
  assert.match(root, /## 4\. Router/);
  assert.match(root, /## 5\. 優先原則/);
  for (const path of [
    "DEVELOPMENT_DELIVERY_RUNBOOK.md",
    "DEVELOPMENT_RECORDS_RUNBOOK.md",
    "AI_EXECUTION_TROUBLESHOOTING.md",
    "AUDIT_THREAD_RULES.md",
  ]) assert.match(root, new RegExp(path.replaceAll(".", "\\.")));
  for (const runbook of runbooks) {
    assert.match(runbook, /`APPLIES_WHEN`/);
    assert.match(runbook, /`DOES_NOT_APPLY`/);
    assert.match(runbook, /`AUTHORITY`.*DEVELOPMENT_EXECUTION_RULES\.md/);
  }
  assert.match(reference, /`REFERENCE_TYPE`: `NON_NORMATIVE`/);
  assert.doesNotMatch(reference, /`AUTHORITY`/);
  assert.match(agents, /origin\/develop:docs\/DEVELOPMENT_EXECUTION_RULES\.md/);
  assert.match(agents, /`POLICY_APPLIED`/);
  assert.match(agents, /history探索/);
  assert.doesNotMatch(agents, /TASK_ACTIVE|logical product write|正式result/);
  assert.doesNotMatch(root, /\bT-\d+/);
  assert.deepEqual(checkCanonicalDevelopmentPolicy(), []);
});

test("state, authorization, evidence and policy adoption each have one owner", () => {
  const root = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const delivery = read("docs/DEVELOPMENT_DELIVERY_RUNBOOK.md");
  const records = read("docs/DEVELOPMENT_RECORDS_RUNBOOK.md");
  const audit = read("docs/AUDIT_THREAD_RULES.md");

  assert.match(root, /task stateは次の三つだけ/);
  assert.match(root, /`TASK_ACTIVE`[\s\S]*`TASK_DONE`[\s\S]*`EXTERNAL_BLOCKED`/);
  assert.match(root, /各判断では上から最初/);
  assert.match(root, /未承認の外部write.*`TASK_ACTIVE`/);
  assert.match(root, /再計画し.*内部回復/);
  for (const subordinate of [delivery, records, audit]) {
    assert.doesNotMatch(subordinate, /task stateは次の三つだけ/);
  }
  assert.match(delivery, /Room.*許可しない/);
  assert.match(delivery, /`READY`.*runtime PASS/);
  assert.match(delivery, /`VALUE_VERIFIABLE`.*`INTERACTION_REQUIRED`.*`VISUAL_REQUIRED`/);
  assert.match(delivery, /`REQUIREMENT_SATISFIED`.*`USER_ACTION_REQUIRED`.*`STATE_UNKNOWN`/);
  for (const token of [
    "`POLICY_APPLIED`", "ルール変更の所有者は利用者", "candidateのremote反映", "logical change", "tool call",
  ]) assert.ok(root.includes(token));
  for (const token of ["変更理由", "適用範囲", "削除・統合する旧規則", "開発速度への影響"]) {
    assert.ok(audit.includes(token));
  }
  assert.match(delivery, /永続状態.*無制限/);
  assert.match(root, /`TERMINAL_DISPOSITION: USER_CANCELED`.*`SUPERSEDED:<replacement>`/);
  assert.match(root, /短い自然文.*固定文言/);
  assert.match(records, /自動配備.*read-back.*health確認.*rollback/);
  assert.match(records, /origin\/develop:docs\/DEVELOPMENT_EXECUTION_RULES\.md/);
  assert.match(records, /commitとpath/);
  assert.match(records, /history探索/);
  assert.doesNotMatch(root + records + read("AGENTS.md"), /POLICY_BLOB/);
  assert.match(records, /同じ`TASK_ACTIVE`.*identity.*再利用/);
});

test("records serialize four roles without becoming a second lifecycle owner", () => {
  const root = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const records = read("docs/DEVELOPMENT_RECORDS_RUNBOOK.md");
  const delivery = read("docs/DEVELOPMENT_DELIVERY_RUNBOOK.md");

  for (const role of ["TASK_CONTRACT", "CURRENT_STATUS", "APPROVAL_REQUEST", "FINAL_RESULT"]) {
    assert.ok(root.includes("`" + role + "`"));
    assert.ok(records.includes("`" + role + "`"));
  }
  assert.match(records, /`HANDOFF`は.*第五の情報所有者にしない/);
  assert.match(records, /`koromo2010\/app-games-checkpoints`/);
  assert.match(records, /`ops\/game-fields-supervisor-records-20260803`/);
  assert.match(records, /`docs\/gpt-save\/`/);
  assert.match(records, /`tasks\/<task-id>\/current\.json`/);
  assert.match(records, /約10分以上remote未到達/);
  assert.match(records, /task停止、承認失効、正式result、bundle作成の契機ではない/);
  assert.match(records, /canonical remote.*再構成できない場合だけ/);
  assert.match(records, /`RECOVERY_CHECKPOINT`.*`FULL_RECOVERY_CHECKPOINT`/);
  assert.match(records, /`CLOSED:YES`.*`TASK_DONE`/);
  assert.match(records, /`CLOSED:NO`.*`TASK_ACTIVE`.*`EXTERNAL_BLOCKED`/);
  assert.doesNotMatch(root + delivery, /`ops\/game-fields-supervisor-records-20260803`/);

  const artifact = [
    "ARTIFACT_TYPE: TASK_CONTRACT",
    "POLICY_APPLIED: docs/DEVELOPMENT_EXECUTION_RULES.md @ 0123456789012345678901234567890123456789",
    "TASK: T-200",
    "OBJECTIVE: Complete the accepted correction",
    "TARGET: development product source",
    "AUTHORIZATION: local reversible work only",
    "SUCCESS_CONDITION: accepted tests pass",
    "TRUE_STOP_CONDITIONS: an external dependency is the only remaining blocker",
  ].join("\n");
  assert.deepEqual(validateDevelopmentArtifact("task-contract", artifact), []);
  assert.deepEqual(validateDevelopmentArtifact("next-instruction", artifact), []);
});

test("artifact validator enforces each role without duplicating prose policy", () => {
  const policy = "POLICY_APPLIED: docs/DEVELOPMENT_EXECUTION_RULES.md @ 0123456789012345678901234567890123456789";
  const status = [
    "ARTIFACT_TYPE: CURRENT_STATUS",
    policy,
    "TASK: T-200",
    "TASK_CONTRACT_POINTER: checkpoint://task/contract",
    "CURRENT_CANDIDATE: abc",
    "COMPLETED_STEPS: implementation",
    "PENDING_STEPS: focused tests",
    "EXTERNAL_WRITE_COUNT: 0",
    "RESUME_POINT: run focused tests",
  ].join("\n");
  assert.deepEqual(validateDevelopmentArtifact("current-status", status), []);
  assert.match(validateDevelopmentArtifact("current-status", status + "\nSUCCESS_CONDITION: changed").join("\n"), /CONTRACT_REDEFINITION/);
  assert.match(validateDevelopmentArtifact("current-status", status + "\nTASK_STATE: TASK_DONE").join("\n"), /TERMINAL_RESULT_IN_CURRENT_STATUS/);

  const approval = [
    "ARTIFACT_TYPE: APPROVAL_REQUEST",
    policy,
    "OPERATION: update develop once",
    "SEMANTIC_ENVIRONMENT: development",
    "TARGET_IDENTITY: refs/heads/develop @ old-sha",
    "MAXIMUM_EXTERNAL_EFFECT: one non-force ref update",
    "PRECONDITIONS: remote ref unchanged",
    "ROLLBACK: restore prior ref with separate approval",
  ].join("\n");
  assert.deepEqual(validateDevelopmentArtifact("approval-request", approval), []);
  assert.match(validateDevelopmentArtifact("approval-request", approval.replace(/^ROLLBACK:.*$/m, "")).join("\n"), /APPROVAL_FIELD_NOT_SINGLE ROLLBACK/);
  assert.match(validateDevelopmentArtifact("approval-request", approval + "\nTARGET_IDENTITY: another-ref").join("\n"), /APPROVAL_FIELD_NOT_SINGLE TARGET_IDENTITY/);

  const result = [
    "ARTIFACT_TYPE: FINAL_RESULT",
    policy,
    "TERMINAL_DISPOSITION: TASK_DONE",
    "OUTCOME: accepted development correction is available",
    "DIRECT_EVIDENCE: remote read-back matched",
  ].join("\n");
  assert.deepEqual(validateDevelopmentArtifact("final-result", result), []);
  assert.match(validateDevelopmentArtifact("final-result", result + "\nTASK_STATE: TASK_ACTIVE").join("\n"), /ACTIVE_STATE_IN_FINAL_RESULT/);
  assert.deepEqual(validateDevelopmentArtifact("final-result", result + "\nSEMANTIC_ENVIRONMENT: development\nTARGET_IDENTITY: refs/heads/develop\nROLLBACK: not needed"), []);

  const handoff = [
    "ARTIFACT_TYPE: HANDOFF",
    "TASK_CONTRACT_POINTER: checkpoint://task/contract",
    "CURRENT_STATUS_POINTER: checkpoint://task/current",
  ].join("\n");
  assert.deepEqual(validateDevelopmentArtifact("handoff", handoff), []);
  assert.match(validateDevelopmentArtifact("handoff", handoff + "\nCURRENT_CANDIDATE: abc").join("\n"), /OWNED_CONTENT_IN_HANDOFF/);
});

test("troubleshooting remains a non-normative technical lookup", () => {
  const root = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const troubleshooting = read("docs/AI_EXECUTION_TROUBLESHOOTING.md");
  const navigation = read("docs/README.md");
  const systemMap = read("docs/SYSTEM_MAP.md");

  assert.match(root, /AI_EXECUTION_TROUBLESHOOTING\.md.*非規範reference/);
  assert.match(troubleshooting, /`structuredContent\.environmentBinding`/);
  assert.match(troubleshooting, /`structuredContent\.proposal\.id`/);
  assert.match(troubleshooting, /`structuredContent\.sdkIdentity`/);
  assert.match(troubleshooting, /result\.isError == true/);
  assert.match(troubleshooting, /別request IDや二件目proposalを作らない/);
  assert.match(troubleshooting, /同一request ID・同一payloadで`prepare_module_profile_update`を冪等replay/);
  assert.match(troubleshooting, /`get_game_module_profile_proposal`をrequest IDで呼ばない/);
  assert.match(troubleshooting, /PowerShellのdouble-quoted string内では/);
  assert.match(troubleshooting, /非空stderrではなくcommand直後の`\$LASTEXITCODE`で判定/);
  assert.match(navigation, /`AI_EXECUTION_TROUBLESHOOTING\.md` 8章/);
  assert.match(systemMap, /`AI_EXECUTION_TROUBLESHOOTING\.md` 8章/);
});

test("handshake documentation matches the implemented request and aggregate verdict", () => {
  const documentation = read("docs/SDK_HANDSHAKE.md");
  const implementation = read("packages/game-sdk/src/handshake.ts");
  const authoringContract = JSON.parse(read("config/sdk-authoring-contract.json"));
  assert.match(documentation, /"name": "ChatGPT Work"/);
  assert.match(documentation, /"canonicalMcpUrl": "https:\/\/sdk-dev\.game-fields\.com\/api\/mcp"/);
  assert.match(documentation, /"onboardingProfileId": "game-fields-development-authoring-v1"/);
  assert.match(documentation, /`accepted`は`problems\.length === 0`から生成されるaggregate verdict/);
  assert.match(implementation, /accepted: problems\.length === 0/);
  assert.match(implementation, /"ChatGPT Work",\s*"Claude Code"/);
  assert.ok(authoringContract.invariants.must.some((rule: string) => (
    rule.includes("post-handshake SDK response")
    && rule.includes("handshake response itself")
  )));
});

test("DownloadMe parses one handshake verdict and reads proposals back", () => {
  const entry = read("sdk/entry/START_GAME_FIELDS.md");
  assert.match(entry, /SET HANDSHAKE := MCP_RESULT\.structuredContent/);
  assert.match(entry, /HANDSHAKE\.accepted != true/);
  assert.match(entry, /HANDSHAKE\.environmentBinding/);
  assert.match(entry, /MCP_RESULT\.content contains exactly one JSON text item/);
  assert.match(entry, /CALL get_game_module_profile_proposal/);
  assert.match(entry, /proposalId: PREPARED_PROPOSAL\.proposal\.id/);
  assert.match(entry, /PROPOSAL_READBACK\.activeProfileChanged == false/);
  assert.match(entry, /identical frozen MODULE_PROPOSAL_PAYLOAD/);
  assert.match(entry, /HALT without a new requestId or second logical proposal/);
  assert.doesNotMatch(entry, /ASSERT response\.accepted == true/);
  assert.doesNotMatch(entry, /PROPOSAL_READBACK\.proposal\.requestId/);
});

test("Claude Code profile uses the same aggregate verdict and proposal contract", () => {
  const profile = read("sdk/entry/START_CLAUDE_CODE.md");
  assert.match(profile, /`accepted=true` is the aggregate verdict/);
  assert.match(profile, /`structuredContent\.environmentBinding`/);
  assert.match(profile, /`structuredContent\.sdkIdentity`/);
  assert.match(profile, /`structuredContent\.proposal\.id`/);
  assert.match(profile, /`get_game_module_profile_proposal` in the same tool flow/);
  assert.match(profile, /same frozen requestId and identical semantic payload/);
  assert.doesNotMatch(profile, /Require `accepted=true`, `problems=\[\]`, and exact matches/);
});

test("current SDK specifications name supported clients without duplicating execution policy", () => {
  const agents = read("AGENTS.md");
  const handoff = read("docs/DEVELOPMENT_HANDOFF.md");
  const external = read("docs/EXTERNAL_GAME_PACKAGE.md");
  const overview = read("docs/CHATGPT_GAME_SDK.md");
  for (const document of [handoff, external, overview]) assert.doesNotMatch(document, /Codex/);
  assert.match(handoff, /ChatGPT WorkとClaude Code/);
  assert.match(agents, /`sdk\/entry\/START_CLAUDE_CODE\.md`/);
  assert.match(handoff, /`accepted=true`をaggregate verdictとして採用/);
  assert.match(overview, /handshake response自体にはpost-handshake用`sdkIdentity`を要求しない/);
  assert.doesNotMatch(agents, /TASK_ACTIVE|checkpoint、内部failure|禁止リスト方式/);
});

test("audit, management and supervision use one responsibility matrix and two independent flows", () => {
  const audit = read("docs/AUDIT_THREAD_RULES.md");
  const root = read("docs/DEVELOPMENT_EXECUTION_RULES.md");

  assert.match(audit, /通常T系列は監査なしで完結/);
  assert.match(audit, /## 1\. 二本のflow/);
  assert.match(audit, /通常T系列[\s\S]*監査系列/);
  assert.match(audit, /## 2\. 責任の一意な所有者/);
  for (const role of ["管理", "監督", "作業", "監査", "監査作業"]) {
    assert.match(audit, new RegExp(`\\| ${role} \\|`));
  }
  assert.match(audit, /`NO_ACTION \/ ABSORB \/ NEW_T_REQUIRED`/);
  assert.match(audit, /`AUDIT_INSTRUCTION`[\s\S]*`AUDIT_RESULT`[\s\S]*`AUDIT_ACCEPTANCE`/);
  assert.match(audit, /`AUDIT_INSTRUCTION`.*`TRUE_STOP_CONDITIONS`/);
  assert.match(audit, /`AUDIT_ID`/);
  assert.match(audit, /`FINDING_ID`.*`FIRST_SEEN`/);
  assert.match(audit, /`AUDIT_RESULT_SUBMITTED`.*`FIX_VERIFIED`.*`AUDIT_CLOSED`/);
  assert.match(audit, /Tのcloseとfinding／TA／CPのcloseを自動伝播しない/);
  assert.match(audit, /ルール保守の権限は本書で再定義せず/);
  assert.match(root, /ルール変更の所有者は利用者/);
});
