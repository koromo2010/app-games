import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ledgerPath = join(root, "docs", "ENVIRONMENT_VARIABLES.md");
const ledger = readFileSync(ledgerPath, "utf8");
const changeRegistryPath = join(root, "config", "environment-change-registry.json");
const changeRegistry = JSON.parse(readFileSync(changeRegistryPath, "utf8"));
const ignoredDirectories = new Set([".git", ".next", "node_modules", "dist", "coverage"]);
const sourceExtensions = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx"]);
const references = new Map();

function extension(path) {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

function scan(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const path = join(directory, entry);
    const info = statSync(path);
    if (info.isDirectory()) {
      scan(path);
      continue;
    }
    if (!sourceExtensions.has(extension(path))) continue;

    const contents = readFileSync(path, "utf8");
    const patterns = [
      /process\.env\.([A-Z][A-Z0-9_]*)/g,
      /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
    ];
    for (const pattern of patterns) {
      for (const match of contents.matchAll(pattern)) {
        const files = references.get(match[1]) ?? new Set();
        files.add(relative(root, path));
        references.set(match[1], files);
      }
    }
  }
}

scan(root);

const missing = [...references.keys()]
  .filter((key) => !ledger.includes(`\`${key}\``))
  .sort();

if (missing.length > 0) {
  console.error("Environment variable ledger is missing code references:");
  for (const key of missing) {
    console.error(`- ${key}: ${[...references.get(key)].join(", ")}`);
  }
  console.error("Add each key to docs/ENVIRONMENT_VARIABLES.md without recording secret values.");
  process.exit(1);
}

const allowedStatuses = new Set([
  "requested",
  "registered",
  "redeployed",
  "verified",
  "cancelled",
]);
const allowedOperations = new Set(["set", "change", "remove", "link", "unlink"]);
const registryFailures = [];
const ids = new Set();
for (const change of changeRegistry.changes ?? []) {
  if (!change || typeof change !== "object") {
    registryFailures.push("change entry must be an object");
    continue;
  }
  if (typeof change.id !== "string" || !change.id) {
    registryFailures.push("change id is required");
  } else if (ids.has(change.id)) {
    registryFailures.push(`duplicate change id: ${change.id}`);
  } else {
    ids.add(change.id);
  }
  for (const field of ["key", "project", "branch", "environment", "note"]) {
    if (typeof change[field] !== "string" || !change[field].trim()) {
      registryFailures.push(`${change.id ?? "unknown"}: ${field} is required`);
    }
  }
  if (!allowedStatuses.has(change.status)) {
    registryFailures.push(`${change.id ?? "unknown"}: invalid status ${change.status}`);
  }
  if (!allowedOperations.has(change.operation)) {
    registryFailures.push(`${change.id ?? "unknown"}: invalid operation ${change.operation}`);
  }
  if (typeof change.sensitive !== "boolean"
    || typeof change.redeployRequired !== "boolean"
    || typeof change.temporary !== "boolean") {
    registryFailures.push(`${change.id ?? "unknown"}: boolean metadata is incomplete`);
  }
  if (typeof change.key === "string" && !ledger.includes(`\`${change.key}\``)) {
    registryFailures.push(`${change.id ?? "unknown"}: ${change.key} is missing from the Markdown ledger`);
  }
}

if (registryFailures.length > 0) {
  console.error("Environment change registry is invalid:");
  for (const failure of registryFailures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Environment ledger covers ${references.size} code-referenced keys and `
  + `${changeRegistry.changes?.length ?? 0} tracked change requests.`,
);
