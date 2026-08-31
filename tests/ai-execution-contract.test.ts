import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  checkCanonicalDevelopmentPolicy,
  validateDevelopmentArtifact,
} from "../scripts/check-development-artifact-policy.mjs";

const read = (path: string) => readFileSync(path, "utf8");
const decisionCase = (text: string, id: string) =>
  text.split(/\r?\n/).find((line) => line.includes(`\`${id}\``)) ?? "";

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
  for (const [caseId, state] of [
    ["ACCEPTED", "TASK_DONE"],
    ["USER_ACTION_AVAILABLE", "TASK_ACTIVE"],
    ["PROTECTED_EFFECT", "TASK_ACTIVE"],
    ["UNKNOWN_WRITE", "TASK_ACTIVE"],
    ["REVERSIBLE_DEVELOPMENT", "TASK_ACTIVE"],
    ["INTERNAL_FAILURE", "TASK_ACTIVE"],
    ["NO_RECOVERY_PATH", "EXTERNAL_BLOCKED"],
  ]) assert.match(decisionCase(root, caseId), new RegExp("`" + state + "`"));
  for (const subordinate of [delivery, records, audit]) {
    assert.doesNotMatch(subordinate, /task stateは次の三つだけ/);
  }
  assert.match(delivery, /disposable Development Room.*standing authorization/);
  assert.match(delivery, /production Room.*明示承認/);
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
    "AUTHORIZATION: standing prototype/development authorization; protected effects excluded",
    "SUCCESS_CONDITION: accepted tests pass",
  ].join("\n");
  assert.deepEqual(validateDevelopmentArtifact("task-contract", artifact), []);
  assert.deepEqual(validateDevelopmentArtifact("next-instruction", artifact), []);

  const withUserBoundary = artifact + "\nUSER_BOUNDARIES: user explicitly limited one protected write";
  assert.deepEqual(validateDevelopmentArtifact("task-contract", withUserBoundary), []);
  const legacySplitBoundary = artifact
    .replace("AUTHORIZATION: standing prototype/development authorization; protected effects excluded", [
      "ALLOWED_PRODUCT_WRITES: one user-approved protected write",
      "FORBIDDEN_EFFECTS: every other protected effect",
    ].join("\n"));
  assert.deepEqual(validateDevelopmentArtifact("task-contract", legacySplitBoundary), []);
  assert.match(
    validateDevelopmentArtifact("task-contract", artifact + "\nTRUE_STOP_CONDITIONS: generated stop").join("\n"),
    /GENERATED_STOP_CONDITIONS_DEPRECATED/,
  );
});

test("prototype development uses standing authorization while protected operations remain gated", () => {
  const root = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const delivery = read("docs/DEVELOPMENT_DELIVERY_RUNBOOK.md");
  const records = read("docs/DEVELOPMENT_RECORDS_RUNBOOK.md");

  assert.match(root, /prototype／development taskの受理.*standing authorization/s);
  assert.match(root, /phase、retry、commit、Deployment、checkpointごとの承認へ分割せず/);
  assert.match(root, /main／production.*再生成不能.*不可逆なmigration／data write.*credential.*MFA.*role.*binding/s);
  assert.match(root, /write結果.*不明.*writeとretryだけを止める/s);
  assert.match(root, /rollbackは別成果物の作成ではなく復元可能性.*Rollbackの成立と最小証拠/s);
  assert.match(root, /\[「Rollbackの成立と最小証拠」\]\(\.\/DEVELOPMENT_DELIVERY_RUNBOOK\.md#rollbackの成立と最小証拠\)/);
  assert.match(root, /\[Records Runbook\]\(\.\/DEVELOPMENT_RECORDS_RUNBOOK\.md\)/);
  assert.match(delivery, /`develop` ref更新.*standing authorization.*non-force/s);
  assert.match(delivery, /各commit、再配備、runtime failure、forward fix.*Execution sheet/);
  assert.match(delivery, /変更前のremote commitまたはtree.*revert／restore commitをnon-forceで追加/s);
  assert.match(delivery, /current headをparent.*対象logical changeの逆差分だけ.*無関係な後続変更を保持/s);
  assert.match(delivery, /古いtree全体への置換には使わない.*競合を理由にforce更新や全tree復元へ切り替えない/s);
  assert.match(delivery, /別のrollback計画書、事前rollback commit.*復元訓練.*rollback専用checkpoint/s);
  assert.match(delivery, /Git refを過去へforceで巻き戻すことは通常のrollbackとみなさない/);
  assert.match(records, /standing authorizationは一回の内部attemptで消費しない/);
  assert.match(records, /Execution sheetは、main／production.*保護対象operation/s);
  assert.match(records, /standing authorization内のrollbackには独立artifactを作らない/);
});

test("development gates follow external effects instead of feature names or generated task limits", () => {
  const root = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const delivery = read("docs/DEVELOPMENT_DELIVERY_RUNBOOK.md");
  const records = read("docs/DEVELOPMENT_RECORDS_RUNBOOK.md");
  const checker = read("scripts/check-development-artifact-policy.mjs");

  assert.match(root, /task contract.*新しい権限、禁止、停止条件の出所ではない/);
  assert.match(root, /利用者が明示していないattempt回数.*追加しない/s);
  assert.match(root, /旧task contract.*attempt上限.*carry-forwardしない/s);
  assert.match(root, /認証・権限・接続logicのsource実装.*standing authorizationに含む/s);
  assert.match(delivery, /認証・権限・接続logicのsource変更.*保護対象状態を実際に変更しない限りこのloopに含む/s);
  assert.match(root, /disposable Development Roomの作成・再作成・通常操作・退出・解散・削除・cleanup/);
  assert.match(root, /disposable Development Room.*事前件数上限を設けず.*最終cleanupの確認を利用者へ求めない/s);
  assert.match(delivery, /disposable Development Room.*事前件数上限を設けず.*追加承認や利用者確認を作らない/s);
  assert.match(delivery, /旧task contract、Execution sheet、checkpoint.*一回限り、最大N件、再作成禁止.*carry-forwardしない/s);
  assert.match(root, /debug mode、runner、operator、fixture.*反復的な利用者操作より先に使う/s);
  assert.match(root, /debug機能の不足.*再利用可能なdebug基盤自体を改善する/s);
  assert.match(delivery, /debug mode、runner、operator、fixture、seed、状態表示.*再ログイン、アカウント切替、一手ごとの入力より先に使う/s);
  assert.match(delivery, /既存debug機能.*利用者へ手作業を転嫁する前にroot causeを特定.*共通debug機能.*改善してtestする/s);
  assert.match(delivery, /debug機能.*正規command、validation、認証・認可、Room membership、server側状態遷移.*権限回避、production有効化で受入を偽装しない/s);
  assert.match(delivery, /別TODO、別task contract、追加承認を作らない/);
  assert.match(delivery, /push後は更新対象remote ref.*自動Deployment.*場合だけ.*runtime health.*必要な場合だけ/s);
  assert.match(delivery, /docs・test・配備対象外path.*一律に要求しない/s);
  assert.match(records, /artifact作成者がattempt回数.*中間停止・再承認点を追加しない/s);
  assert.match(records, /利用者が明示したtask固有の上限、禁止、順序だけを`USER_BOUNDARIES`/);
  assert.match(records, /INSTRUCTION_RECORD_UNSAVED \/ AT RISK.*利用者指示は失効せず.*可逆なlocal／prototype／development作業を続ける/s);
  assert.doesNotMatch(checker, /"事前rollback commit"|"復元訓練"|"rollback専用checkpoint"/);
});

test("routine development waits and accounting stay lightweight without weakening protected effects", () => {
  const root = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const delivery = read("docs/DEVELOPMENT_DELIVERY_RUNBOOK.md");
  const records = read("docs/DEVELOPMENT_RECORDS_RUNBOOK.md");
  const audit = read("docs/AUDIT_THREAD_RULES.md");

  assert.match(decisionCase(root, "USER_ACTION_AVAILABLE"), /`TASK_ACTIVE`/);
  assert.match(decisionCase(root, "NO_RECOVERY_PATH"), /`EXTERNAL_BLOCKED`/);
  assert.match(delivery, /通常のprototype／development loop.*attempt ledgerで数えず/s);
  assert.match(delivery, /利用者がtask固有の上限を明示した場合.*論理件数を管理/s);
  assert.match(delivery, /利用者操作.*`EXTERNAL_BLOCKED`、final result、新しいtask contract、approval requestを作らず/s);
  assert.match(records, /保護対象または結果不明writeが存在する場合だけ.*論理件数/s);
  assert.match(records, /通常Development.*0件一覧として列挙しない/s);
  assert.match(records, /packetは第五のartifactではなく/);
  assert.match(audit, /途中phase.*監督handoffへ変換しない/s);
  assert.match(audit, /完了時に一つのacceptance packetだけ/s);
  assert.match(audit, /保護対象operation.*decision kernelへ返す/s);
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
    "RESUME_POINT: run focused tests",
  ].join("\n");
  assert.deepEqual(validateDevelopmentArtifact("current-status", status), []);
  assert.match(validateDevelopmentArtifact("current-status", status + "\nSUCCESS_CONDITION: changed").join("\n"), /CONTRACT_REDEFINITION/);
  assert.match(validateDevelopmentArtifact("current-status", status + "\nTASK_STATE: TASK_DONE").join("\n"), /TERMINAL_RESULT_IN_CURRENT_STATUS/);

  const approval = [
    "ARTIFACT_TYPE: APPROVAL_REQUEST",
    policy,
    "OPERATION: promote one logical change to main with its declared automatic Production delivery",
    "SEMANTIC_ENVIRONMENT: production",
    "TARGET_IDENTITY: refs/heads/main @ old-sha",
    "MAXIMUM_EXTERNAL_EFFECT: one non-force main update and its declared automatic Production delivery",
    "PRECONDITIONS: candidate and both protected effects approved",
    "ROLLBACK: add a forward revert commit under separate approval",
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
