import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const artifactRoles = new Map([
  ["task-contract", "task-contract"],
  ["next-instruction", "task-contract"],
  ["current-status", "current-status"],
  ["checkpoint", "current-status"],
  ["handoff", "handoff"],
  ["approval-request", "approval-request"],
  ["execution-sheet", "approval-request"],
  ["final-result", "final-result"],
  ["result", "final-result"],
  ["todo-decision", "todo-decision"],
]);

const satellitePolicyReference = /docs\/(?:DEVELOPMENT_DELIVERY_RUNBOOK|DEVELOPMENT_RECORDS_RUNBOOK|AI_EXECUTION_TROUBLESHOOTING|AUDIT_THREAD_RULES)\.md/i;

const checkpointOnlyLabels = /^(?:CURRENT_CANDIDATE|COMPLETED_STEPS|PENDING_STEPS|RESUME_POINT|LAST_CHECKPOINT|CHECKPOINT_COMMIT)\s*:/mi;
const managementForbiddenLabels = /^(?:ALLOWED_PRODUCT_WRITES|FORBIDDEN_EFFECTS|SUCCESS_CONDITION|TRUE_STOP_CONDITIONS|TASK_DONE|CLOSED)\s*:/mi;
const contractOnlyLabels = /^(?:ALLOWED_PRODUCT_WRITES|FORBIDDEN_EFFECTS|SUCCESS_CONDITION|TRUE_STOP_CONDITIONS)\s*:/mi;
const statusOwnedLabels = /^(?:CURRENT_CANDIDATE|COMPLETED_STEPS|PENDING_STEPS|RESUME_POINT|TASK_STATE|TERMINAL_DISPOSITION)\s*:/mi;
const approvalFields = /^(?:OPERATION|SEMANTIC_ENVIRONMENT|TARGET_IDENTITY|MAXIMUM_EXTERNAL_EFFECT|PRECONDITIONS|ROLLBACK)\s*:/mi;
const approvalExclusiveLabels = /^(?:OPERATION|MAXIMUM_EXTERNAL_EFFECT|PRECONDITIONS)\s*:/mi;
const exactPolicyApplied = /^POLICY_APPLIED\s*:\s*docs\/DEVELOPMENT_EXECUTION_RULES\.md\s*@\s*[0-9a-f]{40}\s*$/gmi;
const exactPolicyReference = /^POLICY_REFERENCE\s*:\s*(?:docs\/DEVELOPMENT_EXECUTION_RULES\.md\s*@\s*[0-9a-f]{40}|\r?\n[ \t]*docs\/DEVELOPMENT_EXECUTION_RULES\.md\s*@\s*[0-9a-f]{40})[ \t]*$/gmi;

const countMatches = (text, pattern) => Array.from(text.matchAll(pattern)).length;
const normalizeArtifactType = (type) => type.toLowerCase().replaceAll("_", "-");
const countLabel = (text, label) => countMatches(text, new RegExp(`^${label}\\s*:\\s*\\S.*$`, "gmi"));

function policyAuthorityFields(text) {
  const selected = [];
  let includeContinuation = false;
  for (const line of text.split(/\r?\n/)) {
    const field = line.match(/^([A-Z][A-Z0-9_]*)\s*:/i);
    if (field) {
      includeContinuation = /(?:POLICY|AUTHORITY|COMMON_RULES|EXECUTION_RULES)/i.test(field[1]);
    } else if (!/^\s+/.test(line)) {
      includeContinuation = false;
    }
    if (includeContinuation) selected.push(line);
  }
  return selected.join("\n");
}

function requireSingleFields(errors, text, path, role, labels) {
  for (const label of labels) {
    const count = countLabel(text, label);
    if (count !== 1) errors.push(`${path}: ${role}_FIELD_NOT_SINGLE ${label} count=${count}`);
  }
}

function requireSingleAppliedPolicy(errors, text, path) {
  const count = countMatches(text, exactPolicyApplied);
  if (count !== 1) errors.push(`${path}: POLICY_APPLIED_NOT_SINGLE_EXACT count=${count}`);
  if (countMatches(text, /^POLICY_(?:APPLIED|REFERENCE)\s*:/gmi) !== 1) {
    errors.push(`${path}: POLICY_IDENTITY_NOT_SINGLE`);
  }
}

export function validateDevelopmentArtifact(type, text, path = "<memory>") {
  const errors = [];
  const role = artifactRoles.get(normalizeArtifactType(type));
  if (!role) {
    return [`${path}: UNKNOWN_ARTIFACT_TYPE ${type}`];
  }

  const declaredTypes = Array.from(text.matchAll(/^ARTIFACT_TYPE\s*:\s*(\S+)\s*$/gmi), (match) => normalizeArtifactType(match[1]));
  if (declaredTypes.length === 0) {
    errors.push(`${path}: ARTIFACT_TYPE_MISSING`);
  } else if (declaredTypes.length > 1) {
    errors.push(`${path}: MULTIPLE_ARTIFACT_TYPES`);
  } else if (declaredTypes.length === 1 && artifactRoles.get(declaredTypes[0]) !== role) {
    errors.push(`${path}: ARTIFACT_TYPE_MISMATCH expected-role=${role} actual=${declaredTypes[0]}`);
  }

  if (role === "task-contract") {
    const policyFields = policyAuthorityFields(text);
    if (satellitePolicyReference.test(policyFields)) {
      errors.push(`${path}: SECOND_POLICY_REFERENCE`);
    }
  }

  if (role === "task-contract") {
    const policyCount = countMatches(text, exactPolicyApplied) + countMatches(text, exactPolicyReference);
    if (policyCount !== 1) {
      errors.push(`${path}: POLICY_IDENTITY_MISSING_OR_UNPINNED`);
    }
    if (countMatches(text, /^POLICY_(?:APPLIED|REFERENCE)\s*:/gmi) !== 1) {
      errors.push(`${path}: POLICY_IDENTITY_NOT_SINGLE`);
    }
    requireSingleFields(errors, text, path, "TASK_CONTRACT", [
      "TARGET", "SUCCESS_CONDITION", "TRUE_STOP_CONDITIONS",
    ]);
    const authorizationCount = countLabel(text, "AUTHORIZATION");
    const allowedCount = countLabel(text, "ALLOWED_PRODUCT_WRITES");
    const forbiddenCount = countLabel(text, "FORBIDDEN_EFFECTS");
    const compactAuthorization = authorizationCount === 1 && allowedCount === 0 && forbiddenCount === 0;
    const splitAuthorization = authorizationCount === 0 && allowedCount === 1 && forbiddenCount === 1;
    if (!compactAuthorization && !splitAuthorization) {
      errors.push(`${path}: TASK_CONTRACT_AUTHORIZATION_INVALID`);
    }
    if (checkpointOnlyLabels.test(text)) {
      errors.push(`${path}: CHECKPOINT_STATE_IN_NEXT_INSTRUCTION`);
    }
  }

  if (role === "current-status") {
    requireSingleAppliedPolicy(errors, text, path);
    const contractIdentityCount = countLabel(text, "TASK_CONTRACT_POINTER") + countLabel(text, "TASK_CONTRACT_IDENTITY");
    if (contractIdentityCount !== 1) {
      errors.push(`${path}: CURRENT_STATUS_CONTRACT_IDENTITY_NOT_SINGLE count=${contractIdentityCount}`);
    }
    if (contractOnlyLabels.test(text)) errors.push(`${path}: CONTRACT_REDEFINITION_IN_CURRENT_STATUS`);
    if (/^TERMINAL_DISPOSITION\s*:/mi.test(text) || /^TASK_STATE\s*:\s*(?:TASK_DONE|EXTERNAL_BLOCKED)\s*$/mi.test(text)) {
      errors.push(`${path}: TERMINAL_RESULT_IN_CURRENT_STATUS`);
    }
  }

  if (role === "approval-request") {
    requireSingleAppliedPolicy(errors, text, path);
    if (contractOnlyLabels.test(text)) errors.push(`${path}: CONTRACT_REDEFINITION_IN_APPROVAL_REQUEST`);
    if (countMatches(text, /^OPERATION\s*:/gmi) !== 1) errors.push(`${path}: APPROVAL_OPERATION_NOT_SINGLE`);
    for (const label of ["SEMANTIC_ENVIRONMENT", "TARGET_IDENTITY", "MAXIMUM_EXTERNAL_EFFECT", "PRECONDITIONS", "ROLLBACK"]) {
      const count = countLabel(text, label);
      if (count !== 1) errors.push(`${path}: APPROVAL_FIELD_NOT_SINGLE ${label} count=${count}`);
    }
  }

  if (role === "final-result") {
    requireSingleAppliedPolicy(errors, text, path);
    const terminal = /^TERMINAL_DISPOSITION\s*:\s*(?:TASK_DONE|EXTERNAL_BLOCKED|USER_CANCELED|SUPERSEDED:\S+)\s*$/gmi;
    if (countMatches(text, terminal) !== 1) errors.push(`${path}: TERMINAL_DISPOSITION_INVALID_OR_NOT_SINGLE`);
    if (/^TASK_STATE\s*:\s*TASK_ACTIVE\s*$/mi.test(text)) errors.push(`${path}: ACTIVE_STATE_IN_FINAL_RESULT`);
    if (contractOnlyLabels.test(text) || approvalExclusiveLabels.test(text)) errors.push(`${path}: NON_RESULT_OWNER_FIELDS_IN_FINAL_RESULT`);
  }

  if (role === "handoff") {
    for (const label of ["TASK_CONTRACT_POINTER", "CURRENT_STATUS_POINTER"]) {
      const count = countLabel(text, label);
      if (count !== 1) errors.push(`${path}: HANDOFF_POINTER_NOT_SINGLE ${label} count=${count}`);
    }
    if (contractOnlyLabels.test(text) || statusOwnedLabels.test(text) || approvalFields.test(text)) {
      errors.push(`${path}: OWNED_CONTENT_IN_HANDOFF`);
    }
  }

  if (role === "todo-decision") {
    if (!/^SOURCE\s*:\s*\S+/mi.test(text)) {
      errors.push(`${path}: TODO_DECISION_SOURCE_MISSING`);
    }
    if (!/^DECISION\s*:\s*(?:NO_ACTION|NEW_T_REQUIRED|ABSORB(?::\S+)?)\s*$/mi.test(text)) {
      errors.push(`${path}: TODO_DECISION_INVALID`);
    }
    if (managementForbiddenLabels.test(text)) {
      errors.push(`${path}: TECHNICAL_CONTRACT_IN_TODO_DECISION`);
    }
  }

  return errors;
}

const hasAll = (text, values) => values.every((value) => text.includes(value));

export function getCanonicalDevelopmentPolicyWarnings(read = (path) => readFileSync(path, "utf8")) {
  const warnings = [];
  const agentLines = read("AGENTS.md").split(/\r?\n/).filter((line) => line.trim()).length;
  const ruleCharacters = read("docs/DEVELOPMENT_EXECUTION_RULES.md").length;
  if (agentLines > 40) warnings.push(`AGENTS.md: ENTRY_GUIDE_LARGE lines=${agentLines}`);
  if (ruleCharacters > 12000) warnings.push(`docs/DEVELOPMENT_EXECUTION_RULES.md: DECISION_KERNEL_LARGE characters=${ruleCharacters}`);
  return warnings;
}

export function checkCanonicalDevelopmentPolicy(read = (path) => readFileSync(path, "utf8")) {
  const errors = [];
  const agents = read("AGENTS.md");
  const rules = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const delivery = read("docs/DEVELOPMENT_DELIVERY_RUNBOOK.md");
  const records = read("docs/DEVELOPMENT_RECORDS_RUNBOOK.md");
  const audit = read("docs/AUDIT_THREAD_RULES.md");
  const troubleshooting = read("docs/AI_EXECUTION_TROUBLESHOOTING.md");
  const runbooks = [
    ["docs/DEVELOPMENT_DELIVERY_RUNBOOK.md", delivery],
    ["docs/DEVELOPMENT_RECORDS_RUNBOOK.md", records],
    ["docs/AUDIT_THREAD_RULES.md", audit],
  ];

  if (!hasAll(rules, ["## 2. Decision kernel", "## 3. Task contractと成果物", "## 4. Router", "## 5. 優先原則"])) {
    errors.push("docs/DEVELOPMENT_EXECUTION_RULES.md: DECISION_STRUCTURE_MISSING");
  }
  if (/\bT-\d+/.test(rules)) errors.push("docs/DEVELOPMENT_EXECUTION_RULES.md: TASK_SPECIFIC_RULE_IN_ROOT");
  if (!hasAll(rules, ["ルール変更の所有者は利用者", "candidateのremote反映には別の利用者承認"])) {
    errors.push("docs/DEVELOPMENT_EXECUTION_RULES.md: RULE_CHANGE_OWNERSHIP_MISSING");
  }
  for (const [path, runbook] of runbooks) {
    if (!rules.includes(path.split("/").at(-1))) errors.push(`${path}: ROOT_ROUTE_MISSING`);
    if (!hasAll(runbook, ["`APPLIES_WHEN`", "`DOES_NOT_APPLY`", "`AUTHORITY`", "DEVELOPMENT_EXECUTION_RULES.md"])) {
      errors.push(`${path}: ROUTING_HEADER_MISSING`);
    }
  }
  if (!rules.includes("AI_EXECUTION_TROUBLESHOOTING.md")
    || !troubleshooting.includes("`REFERENCE_TYPE`: `NON_NORMATIVE`")
    || /`AUTHORITY`/.test(troubleshooting)) {
    errors.push("docs/AI_EXECUTION_TROUBLESHOOTING.md: NON_NORMATIVE_REFERENCE_BOUNDARY_MISSING");
  }
  if (!hasAll(rules, ["`TASK_ACTIVE`", "`TASK_DONE`", "`EXTERNAL_BLOCKED`"])) {
    errors.push("docs/DEVELOPMENT_EXECUTION_RULES.md: STATE_SET_MISSING");
  }
  if (!hasAll(rules, ["`TASK_CONTRACT`", "`CURRENT_STATUS`", "`APPROVAL_REQUEST`", "`FINAL_RESULT`"])) {
    errors.push("docs/DEVELOPMENT_EXECUTION_RULES.md: ARTIFACT_ROLES_MISSING");
  }
  if (!hasAll(agents + rules + records, [
    "origin/develop:docs/DEVELOPMENT_EXECUTION_RULES.md", "`POLICY_APPLIED`", "history探索", "commitとpath",
  ])) errors.push("DEVELOPMENT_POLICY: POLICY_IDENTITY_BOUNDARY_MISSING");
  if (/POLICY_BLOB/.test(agents + rules + records)) errors.push("DEVELOPMENT_POLICY: REDUNDANT_POLICY_BLOB_FIELD");
  if (!hasAll(rules, ["`TERMINAL_DISPOSITION: USER_CANCELED`", "`SUPERSEDED:<replacement>`"])) {
    errors.push("docs/DEVELOPMENT_EXECUTION_RULES.md: USER_TERMINATION_MISSING");
  }
  if (!hasAll(rules + records, ["logical change", "tool call", "MAXIMUM_EXTERNAL_EFFECT", "ROLLBACK"])) {
    errors.push("DEVELOPMENT_POLICY: USER_DECISION_APPROVAL_UNIT_MISSING");
  }
  if (!hasAll(records, [
    "`ARTIFACT_TYPE`", "`TARGET`", "`AUTHORIZATION`", "`TASK_CONTRACT_POINTER`", "`TERMINAL_DISPOSITION`",
  ])) errors.push("docs/DEVELOPMENT_RECORDS_RUNBOOK.md: ARTIFACT_SAFETY_SCHEMA_MISSING");
  if (!hasAll(records, [
    "T番号を案件説明の代わりにしない", "`T-<id>（短い案件名）`", "同じ表示内の再出",
  ])) errors.push("docs/DEVELOPMENT_RECORDS_RUNBOOK.md: USER_FACING_TASK_TITLE_MISSING");

  const recordLocators = [
    "`koromo2010/app-games-checkpoints`",
    "`ops/game-fields-supervisor-records-20260803`",
    "`docs/gpt-save/`",
    "`tasks/<task-id>/current.json`",
  ];
  for (const locator of recordLocators) {
    if (!records.includes(locator)) errors.push(`docs/DEVELOPMENT_RECORDS_RUNBOOK.md: RECORD_LOCATOR_MISSING ${locator}`);
    if (rules.includes(locator) || delivery.includes(locator)) errors.push(`RECORD_LOCATOR_OUTSIDE_RECORDS ${locator}`);
  }
  if (!hasAll(records, ["約10分", "task停止", "`LEGACY_READ_ONLY`", "`RECOVERY_CHECKPOINT`", "`CLOSED:YES`"])) {
    errors.push("docs/DEVELOPMENT_RECORDS_RUNBOOK.md: RECOVERY_COMPATIBILITY_MISSING");
  }
  if (!hasAll(delivery, ["read-only", "local再現", "DevTools", "secret"])) {
    errors.push("docs/DEVELOPMENT_DELIVERY_RUNBOOK.md: SAFE_DIAGNOSTIC_BOUNDARY_MISSING");
  }
  if (!hasAll(audit, ["`TRUE_STOP_CONDITIONS`", "`AUDIT_ID`", "`FINDING_ID`", "`FIRST_SEEN`"])) {
    errors.push("docs/AUDIT_THREAD_RULES.md: AUDIT_IDENTITY_BOUNDARY_MISSING");
  }
  if (!hasAll(audit, [
    "## 6. Rule maintenance", "変更理由", "適用範囲", "削除・統合する旧規則", "開発速度への影響",
  ])) errors.push("docs/AUDIT_THREAD_RULES.md: RULE_MAINTENANCE_BOUNDARY_MISSING");
  const current = read("docs/CURRENT_STATE.md");
  const handoff = read("docs/DEVELOPMENT_HANDOFF.md");
  if (/^#{2,4}\s+.*\bT-\d+/m.test(current) || /^#{2,4}\s+.*\bT-\d+/m.test(handoff)) {
    errors.push("CURRENT_STATE_OR_HANDOFF: TASK_HISTORY_HEADING_IN_CURRENT_DOC");
  }
  if (/AIはCloud Browser、connector、公式API、CLIその他の経路でVercelへ直接アクセスしない/.test(read("docs/ENVIRONMENT_VARIABLES.md"))) {
    errors.push("docs/ENVIRONMENT_VARIABLES.md: VERCEL_PUBLIC_READ_CONFLICT");
  }
  return errors;
}

function runCli(argv) {
  if (argv.length === 0) {
    return checkCanonicalDevelopmentPolicy();
  }

  if (argv[0] !== "--type" || argv.length < 3) {
    return ["usage: node scripts/check-development-artifact-policy.mjs [--type <task-contract|current-status|approval-request|final-result|todo-decision|legacy-label> <file> ...]"];
  }

  const [, type, ...paths] = argv;
  return paths.flatMap((path) => validateDevelopmentArtifact(type, readFileSync(path, "utf8"), path));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const errors = runCli(argv);
  if (argv.length === 0) {
    for (const warning of getCanonicalDevelopmentPolicyWarnings()) {
      console.warn(`[development-artifact-policy] WARNING ${warning}`);
    }
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`[development-artifact-policy] ${error}`);
    process.exitCode = 1;
  } else {
    console.log("[development-artifact-policy] PASS");
  }
}
