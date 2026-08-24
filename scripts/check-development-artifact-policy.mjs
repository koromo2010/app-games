import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const artifactTypes = new Set([
  "next-instruction",
  "checkpoint",
  "execution-sheet",
  "result",
  "handoff",
]);

const duplicatedCommonRules = [
  ["COMMON_SAVE_SCHEDULE", /(?:遅くとも)?約10分[^\n]*checkpoint/i],
  ["COMMON_FULL_RESTORE", /fresh restore[^\n]*(?:remote read-back|read-back)/i],
  ["COMMON_TASK_LIFECYCLE", /TASK_ACTIVE[^\n]*TASK_DONE[^\n]*EXTERNAL_BLOCKED/i],
  ["COMMON_AUDIT_ROLE", /監査[^\n]*通常T系列[^\n]*独立/],
  ["SECOND_POLICY_REFERENCE", /docs\/(?:AI_EXECUTION_TROUBLESHOOTING|AUDIT_THREAD_RULES)\.md/],
];

const checkpointOnlyLabels = /^(?:CURRENT_CANDIDATE|COMPLETED_STEPS|PENDING_STEPS|RESUME_POINT|LAST_CHECKPOINT|CHECKPOINT_COMMIT)\s*:/mi;

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

  return errors;
}

export function checkCanonicalDevelopmentPolicy(read = (path) => readFileSync(path, "utf8")) {
  const errors = [];
  const agents = read("AGENTS.md");
  const rules = read("docs/DEVELOPMENT_EXECUTION_RULES.md");
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
    return ["usage: node scripts/check-development-artifact-policy.mjs [--type <next-instruction|checkpoint|execution-sheet|result|handoff> <file> ...]"];
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
