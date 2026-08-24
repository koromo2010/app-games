import assert from "node:assert/strict";
import test from "node:test";

import {
  checkCanonicalDevelopmentPolicy,
  validateDevelopmentArtifact,
} from "../scripts/check-development-artifact-policy.mjs";

test("canonical development policy keeps one compact entry and one artifact router", () => {
  assert.deepEqual(checkCanonicalDevelopmentPolicy(), []);
});

test("a next instruction contains only its pinned contract reference", () => {
  const instruction = `
# T-200 next instruction

POLICY_REFERENCE:
docs/DEVELOPMENT_EXECUTION_RULES.md @ 0123456789abcdef0123456789abcdef01234567

TASK: T-200
OBJECTIVE: Complete the accepted development correction.
SUCCESS_CONDITION: The task-specific acceptance passes.
TRUE_STOP_CONDITIONS: A required operation exceeds the accepted authorization.
`;
  assert.deepEqual(validateDevelopmentArtifact("next-instruction", instruction), []);
});

test("the artifact check rejects common-policy expansion and checkpoint state in a next instruction", () => {
  const instruction = `
POLICY_REFERENCE: docs/DEVELOPMENT_EXECUTION_RULES.md @ 0123456789abcdef0123456789abcdef01234567
CURRENT_CANDIDATE: abcdef
遅くとも約10分ごとにcheckpointを保存する。
`;
  const errors = validateDevelopmentArtifact("next-instruction", instruction);
  assert.ok(errors.some((error) => error.includes("COMMON_SAVE_SCHEDULE")));
  assert.ok(errors.some((error) => error.includes("CHECKPOINT_STATE_IN_NEXT_INSTRUCTION")));
});

test("checkpoint state remains valid as a checkpoint", () => {
  const checkpoint = `
ARTIFACT_TYPE: checkpoint
CURRENT_CANDIDATE: abcdef
COMPLETED_STEPS: focused test
PENDING_STEPS: runtime acceptance
RESUME_POINT: continue the same TASK_ACTIVE contract
`;
  assert.deepEqual(validateDevelopmentArtifact("checkpoint", checkpoint), []);
});
