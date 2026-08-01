import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectProfiles = Object.freeze({
  "app-games": { branch: "main", surface: "platform" },
  "app-games-dev": { branch: "develop", surface: "platform" },
  "app-games-sdk": { branch: "main", surface: "portal" },
  "app-games-sdk-dev": { branch: "develop", surface: "portal" },
  "app-games-sdk-portal": { disabled: true, surface: "portal" },
  "app-games-sdk-preview": { branch: "main", surface: "preview" },
  "app-games-preview-dev": { branch: "develop", surface: "preview" },
});

const commonBuildPaths = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^tsconfig(?:\.[^/]+)?\.json$/,
  /^next-env\.d\.ts$/,
  /^config\//,
  /^types\//,
];

const surfaceBuildPaths = Object.freeze({
  platform: [
    /^app\//,
    /^games\//,
    /^lib\//,
    /^public\//,
    /^packages\/game-sdk\//,
    /^packages\/game-runtime\//,
    /^packages\/sdk-service-auth\//,
    /^middleware\.(?:ts|js|mjs)$/,
    /^instrumentation\.(?:ts|js|mjs)$/,
    /^next\.config\.(?:ts|js|mjs)$/,
    /^postcss\.config\.(?:js|mjs|cjs)$/,
    /^vercel\.json$/,
  ],
  portal: [
    /^apps\/sdk-portal\//,
    /^packages\/game-sdk\//,
    /^packages\/sdk-preview-auth\//,
    /^packages\/sdk-package-assets\//,
    /^packages\/sdk-release-profiles\//,
    /^packages\/sdk-runtime-artifact\//,
    /^packages\/sdk-service-auth\//,
    /^sdk\//,
    /^scripts\/migrate-sdk-database\.mjs$/,
  ],
  preview: [
    /^apps\/sdk-preview\//,
    /^packages\/game-sdk\//,
    /^packages\/sdk-preview-auth\//,
    /^packages\/sdk-package-assets\//,
    /^packages\/sdk-runtime-artifact\//,
  ],
});

const documentationOnlyPaths = [
  /^docs\//,
  /^README(?:\.[^/]+)?\.md$/i,
  /^[^/]+\.md$/i,
  /^\.github\/(?:ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE)\//,
];

function normalizePath(path) {
  return String(path ?? "").trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

export function evaluateVercelBuild({ projectName, branch, changedPaths }) {
  const profile = projectProfiles[projectName];
  if (!profile) return { build: true, reason: "unknown-project" };
  if (profile.disabled) return { build: false, reason: "project-disabled" };
  if (branch !== profile.branch) return { build: false, reason: `branch-mismatch:${profile.branch}` };

  const paths = Array.isArray(changedPaths)
    ? [...new Set(changedPaths.map(normalizePath).filter(Boolean))]
    : null;
  if (!paths || paths.length === 0) return { build: true, reason: "diff-unavailable" };
  if (paths.every((path) => matchesAny(path, documentationOnlyPaths))) {
    return { build: false, reason: "documentation-only" };
  }

  const patterns = [...commonBuildPaths, ...surfaceBuildPaths[profile.surface]];
  const affected = paths.filter((path) => matchesAny(path, patterns));
  if (affected.length === 0) return { build: false, reason: `surface-unaffected:${profile.surface}` };
  return { build: true, reason: `surface-affected:${profile.surface}`, affected };
}

function validSha(value) {
  return /^[0-9a-f]{7,40}$/i.test(value ?? "") && !/^0+$/.test(value ?? "");
}

export function changedPathsFromGit(env = process.env) {
  const previous = env.VERCEL_GIT_PREVIOUS_SHA;
  const current = env.VERCEL_GIT_COMMIT_SHA;
  const args = validSha(previous) && validSha(current)
    ? ["diff", "--name-only", previous, current, "--"]
    : ["diff", "--name-only", "HEAD^", "HEAD", "--"];
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).map(normalizePath).filter(Boolean);
}

function runCli() {
  const projectName = process.argv[2] || process.env.VERCEL_PROJECT_NAME || "";
  const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
  const decision = evaluateVercelBuild({
    projectName,
    branch,
    changedPaths: changedPathsFromGit(),
  });
  console.log(`[vercel-build-impact] ${projectName || "unknown"} ${branch || "unknown"}: ${decision.build ? "build" : "skip"} (${decision.reason})`);
  process.exit(decision.build ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runCli();
