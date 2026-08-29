import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const artifactTypes = new Set([
  "next-instruction",
  "checkpoint",
  "execution-sheet",
  "result",
  "handoff",
  "todo-decision",
]);

const duplicatedCommonRules = [
  ["COMMON_SAVE_SCHEDULE", /(?:遅くとも)?約10分[^\n]*checkpoint/i],
  ["COMMON_FULL_RESTORE", /fresh restore[^\n]*(?:remote read-back|read-back)/i],
  ["COMMON_TASK_LIFECYCLE", /TASK_ACTIVE[^\n]*TASK_DONE[^\n]*EXTERNAL_BLOCKED/i],
  ["COMMON_AUDIT_ROLE", /監査[^\n]*通常T系列[^\n]*独立/],
  ["SECOND_POLICY_REFERENCE", /docs\/(?:DEVELOPMENT_DELIVERY_RUNBOOK|DEVELOPMENT_RECORDS_RUNBOOK|AI_EXECUTION_TROUBLESHOOTING|AUDIT_THREAD_RULES)\.md/],
];

const checkpointOnlyLabels = /^(?:CURRENT_CANDIDATE|COMPLETED_STEPS|PENDING_STEPS|RESUME_POINT|LAST_CHECKPOINT|CHECKPOINT_COMMIT)\s*:/mi;
const managementForbiddenLabels = /^(?:ALLOWED_PRODUCT_WRITES|FORBIDDEN_EFFECTS|SUCCESS_CONDITION|TRUE_STOP_CONDITIONS|TASK_DONE|CLOSED)\s*:/mi;

const countMatches = (text, pattern) => Array.from(text.matchAll(pattern)).length;

export function validateDevelopmentArtifact(type, text, path = "<memory>") {
  const errors = [];
  if (!artifactTypes.has(type)) {
    return [`${path}: UNKNOWN_ARTIFACT_TYPE ${type}`];
  }

  const declaredTypes = Array.from(text.matchAll(/^ARTIFACT_TYPE\s*:\s*(\S+)\s*$/gmi), (match) => match[1].toLowerCase());
  if (declaredTypes.length > 1) {
    errors.push(`${path}: MULTIPLE_ARTIFACT_TYPES`);
  } else if (declaredTypes.length === 1 && declaredTypes[0] !== type) {
    errors.push(`${path}: ARTIFACT_TYPE_MISMATCH expected=${type} actual=${declaredTypes[0]}`);
  }

  for (const [code, pattern] of duplicatedCommonRules) {
    if (pattern.test(text)) {
      errors.push(`${path}: ${code}`);
    }
  }

  if (type === "next-instruction") {
    const policyReference = /POLICY_REFERENCE\s*:\s*(?:\r?\n\s*)?docs\/DEVELOPMENT_EXECUTION_RULES\.md\s*@\s*[0-9a-f]{40}\b/i;
    if (!policyReference.test(text)) {
      errors.push(`${path}: POLICY_REFERENCE_MISSING_OR_UNPINNED`);
    }
    if (countMatches(text, /POLICY_REFERENCE/gi) !== 1) {
      errors.push(`${path}: POLICY_REFERENCE_NOT_SINGLE`);
    }
    if (checkpointOnlyLabels.test(text)) {
      errors.push(`${path}: CHECKPOINT_STATE_IN_NEXT_INSTRUCTION`);
    }
  }

  if (type === "todo-decision") {
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

export function checkCanonicalDevelopmentPolicy(read = (path) => readFileSync(path, "utf8")) {
  const errors = [];
  const agents = read("AGENTS.md");
  const rules = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
  const satellites = [
    ["docs/DEVELOPMENT_DELIVERY_RUNBOOK.md", read("docs/DEVELOPMENT_DELIVERY_RUNBOOK.md")],
    ["docs/DEVELOPMENT_RECORDS_RUNBOOK.md", read("docs/DEVELOPMENT_RECORDS_RUNBOOK.md")],
    ["docs/AI_EXECUTION_TROUBLESHOOTING.md", read("docs/AI_EXECUTION_TROUBLESHOOTING.md")],
    ["docs/AUDIT_THREAD_RULES.md", read("docs/AUDIT_THREAD_RULES.md")],
  ];
  const current = read("docs/CURRENT_STATE.md");
  const handoff = read("docs/DEVELOPMENT_HANDOFF.md");
  const environment = read("docs/ENVIRONMENT_VARIABLES.md");

  const agentLines = agents.split(/\r?\n/).filter((line) => line.trim()).length;
  if (agentLines > 40) errors.push(`AGENTS.md: ENTRY_GUIDE_TOO_LARGE lines=${agentLines}`);
  if (!rules.includes("成果物routerと個別指示の単一参照方式")) {
    errors.push("docs/DEVELOPMENT_EXECUTION_RULES.md: ARTIFACT_ROUTER_MISSING");
  }
  if (!rules.includes("INSTRUCTION_RECORD_UNSAVED / AT RISK")) {
    errors.push("docs/DEVELOPMENT_EXECUTION_RULES.md: DURABLE_NEXT_INSTRUCTION_MISSING");
  }
  if (/\bT-\d+/.test(rules)) {
    errors.push("docs/DEVELOPMENT_EXECUTION_RULES.md: TASK_SPECIFIC_RULE_IN_ROOT");
  }
  if (!rules.includes("監督スレ、監査スレ、監査作業スレ、作業スレは、本書")) {
    errors.push("docs/DEVELOPMENT_EXECUTION_RULES.md: RULE_CHANGE_OWNERSHIP_MISSING");
  }
  if (!rules.includes("利用者が管理スレでルール変更を目的として明示的に開始した独立したルール保守作業に限り")) {
    errors.push("docs/DEVELOPMENT_EXECUTION_RULES.md: MANAGEMENT_RULE_MAINTENANCE_BOUNDARY_MISSING");
  }
  for (const [path, satellite] of satellites) {
    const filename = path.split("/").at(-1);
    if (!rules.includes(filename)) errors.push(`${path}: ROOT_ROUTE_MISSING`);
    if (!satellite.includes("`APPLIES_WHEN`")) errors.push(`${path}: APPLIES_WHEN_MISSING`);
    if (!satellite.includes("`DOES_NOT_APPLY`")) errors.push(`${path}: DOES_NOT_APPLY_MISSING`);
    if (!satellite.includes("`AUTHORITY`") || !satellite.includes("DEVELOPMENT_EXECUTION_RULES.md")) {
      errors.push(`${path}: ROOT_AUTHORITY_MISSING`);
    }
  }
  if (/^#{2,4}\s+.*\bT-\d+/m.test(current) || /^#{2,4}\s+.*\bT-\d+/m.test(handoff)) {
    errors.push("CURRENT_STATE_OR_HANDOFF: TASK_HISTORY_HEADING_IN_CURRENT_DOC");
  }
  if (/AIはCloud Browser、connector、公式API、CLIその他の経路でVercelへ直接アクセスしない/.test(environment)) {
    errors.push("docs/ENVIRONMENT_VARIABLES.md: VERCEL_PUBLIC_READ_CONFLICT");
  }

  return errors;
}

function runCli(argv) {
  if (argv.length === 0) {
    return checkCanonicalDevelopmentPolicy();
  }

  if (argv[0] !== "--type" || argv.length < 3) {
    return ["usage: node scripts/check-development-artifact-policy.mjs [--type <next-instruction|checkpoint|execution-sheet|result|handoff|todo-decision> <file> ...]"];
  }

  const [, type, ...paths] = argv;
  return paths.flatMap((path) => validateDevelopmentArtifact(type, readFileSync(path, "utf8"), path));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const errors = runCli(process.argv.slice(2));
  if (errors.length > 0) {
    for (const error of errors) console.error(`[development-artifact-policy] ${error}`);
    process.exitCode = 1;
  } else {
    console.log("[development-artifact-policy] PASS");
  }
}
