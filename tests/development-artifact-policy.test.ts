import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  checkCanonicalDevelopmentPolicy,
  validateDevelopmentArtifact,
} from "../scripts/check-development-artifact-policy.mjs";

test("canonical development policy keeps one compact entry and one artifact router", () => {
  assert.deepEqual(checkCanonicalDevelopmentPolicy(), []);
});

test("policy identity is reused during one active task instead of remote-reading every record", () => {
  const records = readFileSync("docs/DEVELOPMENT_RECORDS_RUNBOOK.md", "utf8");
  assert.match(records, /同じ`TASK_ACTIVE`で確認済みのidentityはそのまま再利用/);
  assert.match(records, /record作成.*remote再確認の契機にしない/);
});

test("user-facing task references pair the first ID with a short title", () => {
  const records = readFileSync("docs/DEVELOPMENT_RECORDS_RUNBOOK.md", "utf8");
  assert.match(records, /T番号を案件説明の代わりにしない/);
  assert.match(records, /`T-<id>（短い案件名）`/);
  assert.match(records, /同じ表示内の再出.*IDだけでよい/);
  assert.match(records, /新しいscopeやstateを加えない/);
});

test("a next instruction contains only its pinned contract reference", () => {
  const instruction = `
# T-200 next instruction

ARTIFACT_TYPE: NEXT_INSTRUCTION
POLICY_REFERENCE:
docs/DEVELOPMENT_EXECUTION_RULES.md @ 0123456789abcdef0123456789abcdef01234567

TASK: T-200
OBJECTIVE: Complete the accepted development correction.
TARGET: development product source
AUTHORIZATION: standing prototype/development authorization; protected effects excluded
SUCCESS_CONDITION: The task-specific acceptance passes.
`;
  assert.deepEqual(validateDevelopmentArtifact("next-instruction", instruction), []);
});

test("the artifact check allows prose detail but rejects checkpoint state in a next instruction", () => {
  const instruction = `
ARTIFACT_TYPE: NEXT_INSTRUCTION
POLICY_REFERENCE: docs/DEVELOPMENT_EXECUTION_RULES.md @ 0123456789abcdef0123456789abcdef01234567
TASK: T-200
OBJECTIVE: Complete the correction
TARGET: development product source
AUTHORIZATION: standing prototype/development authorization; protected effects excluded
SUCCESS_CONDITION: accepted tests pass
CURRENT_CANDIDATE: abcdef
EXECUTION_RULES: 遅くとも約10分ごとにcheckpointを保存する。
`;
  const errors = validateDevelopmentArtifact("next-instruction", instruction);
  assert.ok(!errors.some((error) => error.includes("COMMON_SAVE_SCHEDULE")));
  assert.ok(errors.some((error) => error.includes("CHECKPOINT_STATE_IN_NEXT_INSTRUCTION")));
});

test("an individual artifact cannot bypass the root router to reference a satellite", () => {
  const instruction = `
ARTIFACT_TYPE: NEXT_INSTRUCTION
POLICY_REFERENCE: docs/DEVELOPMENT_EXECUTION_RULES.md @ 0123456789abcdef0123456789abcdef01234567
TASK: T-200
OBJECTIVE: Complete the correction
TARGET: development product source
AUTHORIZATION: standing prototype/development authorization; protected effects excluded
SUCCESS_CONDITION: accepted tests pass
SECONDARY_POLICY: docs/DEVELOPMENT_DELIVERY_RUNBOOK.md
`;
  const errors = validateDevelopmentArtifact("next-instruction", instruction);
  assert.ok(errors.some((error) => error.includes("SECOND_POLICY_REFERENCE")));
});

test("checkpoint state remains valid as a checkpoint", () => {
  const checkpoint = `
ARTIFACT_TYPE: checkpoint
POLICY_APPLIED: docs/DEVELOPMENT_EXECUTION_RULES.md @ 0123456789abcdef0123456789abcdef01234567
TASK: T-200
TASK_CONTRACT_POINTER: checkpoint://task/contract
CURRENT_CANDIDATE: abcdef
COMPLETED_STEPS: focused test
PENDING_STEPS: runtime acceptance
RESUME_POINT: continue the same TASK_ACTIVE contract
`;
  assert.deepEqual(validateDevelopmentArtifact("checkpoint", checkpoint), []);
});

test("new checkpoints require exact applied policy while legacy records remain immutable history", () => {
  const checkpoint = `
ARTIFACT_TYPE: checkpoint
TASK: T-200
TASK_CONTRACT_POINTER: checkpoint://task/contract
CURRENT_CANDIDATE: abcdef
COMPLETED_STEPS: implementation
PENDING_STEPS: runtime acceptance
RESUME_POINT: continue the same TASK_ACTIVE contract
`;
  const errors = validateDevelopmentArtifact("checkpoint", checkpoint);
  assert.ok(errors.some((error) => error.includes("POLICY_APPLIED_NOT_SINGLE_EXACT")));
});

test("natural-language evidence and progress do not require fixed labels", () => {
  const policy = "POLICY_APPLIED: docs/DEVELOPMENT_EXECUTION_RULES.md @ 0123456789abcdef0123456789abcdef01234567";
  const result = [
    "ARTIFACT_TYPE: FINAL_RESULT",
    policy,
    "TERMINAL_DISPOSITION: TASK_DONE",
    "顧客への結果：policy maintenance candidate passed。",
    "直接証拠：docs/DEVELOPMENT_DELIVERY_RUNBOOK.md was updated and verified。",
  ].join("\n");
  const status = [
    "ARTIFACT_TYPE: CURRENT_STATUS",
    policy,
    "TASK_CONTRACT_IDENTITY: contract-v1",
    "約10分checkpoint ruleの確認は完了。外部writeは0件。次はfocused testsから再開する。",
  ].join("\n");
  assert.deepEqual(validateDevelopmentArtifact("final-result", result), []);
  assert.deepEqual(validateDevelopmentArtifact("current-status", status), []);
});

test("artifacts missing a safety boundary or contract identity are rejected", () => {
  const policy = "POLICY_APPLIED: docs/DEVELOPMENT_EXECUTION_RULES.md @ 0123456789abcdef0123456789abcdef01234567";
  const emptyContract = ["ARTIFACT_TYPE: TASK_CONTRACT", policy].join("\n");
  const emptyStatus = ["ARTIFACT_TYPE: CURRENT_STATUS", policy].join("\n");
  assert.match(validateDevelopmentArtifact("task-contract", emptyContract).join("\n"), /TASK_CONTRACT_FIELD_NOT_SINGLE TARGET/);
  assert.match(validateDevelopmentArtifact("current-status", emptyStatus).join("\n"), /CURRENT_STATUS_CONTRACT_IDENTITY_NOT_SINGLE/);
});

test("a management TODO decision is a distinct durable artifact", () => {
  const decision = `
ARTIFACT_TYPE: todo-decision
SOURCE: Game-Fields-TA-035-audit-acceptance.md
DECISION: NEW_T_REQUIRED
TASK: T-181
PRIORITY: P2
OWNER: supervisor
DEPENDENCIES: none
`;
  assert.deepEqual(validateDevelopmentArtifact("todo-decision", decision), []);
});

test("a management TODO decision cannot absorb the supervisor contract", () => {
  const decision = `
ARTIFACT_TYPE: todo-decision
SOURCE: user-request-20260824
DECISION: NEW_T_REQUIRED
TASK: T-181
SUCCESS_CONDITION: production behavior is accepted
`;
  const errors = validateDevelopmentArtifact("todo-decision", decision);
  assert.ok(errors.some((error) => error.includes("TECHNICAL_CONTRACT_IN_TODO_DECISION")));
});
