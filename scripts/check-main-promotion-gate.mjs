import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const execute = process.argv.includes("--execute");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const manifest = JSON.parse(readFileSync(new URL("../config/main-promotion-projects.json", import.meta.url), "utf8"));
const requiredProjects = [
  "app-games",
  "app-games-dev",
  "app-games-sdk",
  "app-games-sdk-dev",
  "app-games-sdk-preview",
  "app-games-preview-dev",
  "app-games-sdk-portal",
];

function run(command, args, options = {}) {
  const inherit = options.inherit === true;
  const result = execFileSync(command, args, {
    encoding: inherit ? undefined : "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });
  return inherit ? "" : String(result ?? "").trim();
}

function fail(message) {
  console.error(`PROMOTION_GATE_FAILED: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

const names = manifest.projects.map((entry) => entry.project);
for (const project of requiredProjects) {
  if (!names.includes(project)) fail(`missing Vercel project: ${project}`);
}
if (new Set(names).size !== names.length || names.length !== requiredProjects.length) {
  fail("project manifest must contain exactly the seven required projects");
}
for (const entry of manifest.projects) {
  if (!entry.domain || !entry.branch || !entry.role) fail(`incomplete project entry: ${entry.project}`);
}

console.log("\nVercel promotion scope");
console.table(manifest.projects);

const status = run("git", ["status", "--porcelain"]);
if (status) fail("working tree is not clean");
run("git", ["fetch", "origin", "main", "develop"], { inherit: true });

const localBranch = run("git", ["branch", "--show-current"]);
if (localBranch !== "develop") fail(`run from develop, current branch is ${localBranch || "detached"}`);

const localDevelop = run("git", ["rev-parse", "HEAD"]);
const remoteDevelop = run("git", ["rev-parse", "origin/develop"]);
const remoteMain = run("git", ["rev-parse", "origin/main"]);
if (localDevelop !== remoteDevelop) fail("local develop is not identical to origin/develop");

const mergeBase = run("git", ["merge-base", "origin/main", "origin/develop"]);
const mainOnly = Number(run("git", ["rev-list", "--count", "origin/develop..origin/main"]));
const developOnly = Number(run("git", ["rev-list", "--count", "origin/main..origin/develop"]));
if (mainOnly > 0) fail(`main contains ${mainOnly} commit(s) absent from develop; reconcile before promotion`);
if (mergeBase !== remoteMain) fail("origin/main is not an ancestor of origin/develop; non-force promotion is unsafe");

const report = {
  generatedAt: new Date().toISOString(),
  localBranch,
  commits: { main: remoteMain, develop: remoteDevelop, mergeBase },
  divergence: { mainOnly, developOnly },
  projects: manifest.projects,
  checks: {
    cleanWorkingTree: true,
    localDevelopMatchesRemote: true,
    mainIsAncestorOfDevelop: true,
    forcePushAllowed: false,
    verifyExecuted: execute,
    testsExecuted: execute,
    buildsExecuted: execute,
    vercelDeploymentsVerified: false,
    realNetworkVerified: false
  }
};

if (execute) {
  for (const [command, args] of [
    [npmCommand, ["run", "verify"]],
    [npmCommand, ["test"]],
    [npmCommand, ["run", "build"]],
    [npmCommand, ["run", "build:sdk"]],
    [npmCommand, ["run", "build:sdk-preview"]]
  ]) run(command, args, { inherit: true });
}

writeFileSync("main-promotion-gate-report.json", `${JSON.stringify(report, null, 2)}\n`);
console.log("\nGate report written to main-promotion-gate-report.json");
console.log(`main ${remoteMain}`);
console.log(`develop ${remoteDevelop}`);
console.log(`develop-only commits ${developOnly}`);
console.log("Force push is forbidden.");
console.log("Vercel READY/SHA and real Network checks remain mandatory before completion.");
