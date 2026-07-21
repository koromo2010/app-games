import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { extractStoredZip } from "./lib/stored-zip.mjs";

const root = resolve(import.meta.dirname, "..");
const fixtureRoot = mkdtempSync(join(tmpdir(), "game-fields-sdk-starter-check-"));
const zipPath = join(fixtureRoot, "starter.zip");
const extractRoot = join(fixtureRoot, "extracted");
const repositoryRoot = join(fixtureRoot, "repository");
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(fixtureRoot, "npm-cache"),
};

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(absolutePath) : [absolutePath];
    });
}

function fileMap(directory) {
  return new Map(collectFiles(directory).map((absolutePath) => [
    relative(directory, absolutePath).replaceAll("\\", "/"),
    createHash("sha256").update(readFileSync(absolutePath)).digest("hex"),
  ]));
}

try {
  execFileSync(process.execPath, [
    join(root, "scripts/build-game-sdk-starter.mjs"),
    "--output",
    zipPath,
  ], { cwd: root, stdio: "pipe", env: npmEnvironment });

  const entries = extractStoredZip(zipPath, extractRoot);
  const starterRoot = join(extractRoot, "game-fields-sdk-starter");
  for (const required of [
    "START_HERE.md",
    "AGENTS.md",
    "GAME_SPEC.md",
    "APP_REQUIREMENTS.md",
    "SDK_MODULE_CATALOG.md",
    "MOCK_GUIDE.md",
    "MOCK_REVIEW.md",
    "SDK_API.md",
    "SUBMISSION_CHECKLIST.md",
    "starter-manifest.json",
    "package.json",
    "scripts/build-submission.mjs",
    "scripts/check-mock.mjs",
    "scripts/stored-zip.mjs",
    "apps/sdk-portal/.vercel-root-placeholder",
    "src/manifest.ts",
    "src/contracts.ts",
    "src/server-module.ts",
    "tests/game-contract.test.ts",
    "mock/README.md",
  ]) {
    if (!entries.includes(`game-fields-sdk-starter/${required}`)) {
      throw new Error(`Starter archive is missing ${required}.`);
    }
  }
  const packageJson = JSON.parse(readFileSync(join(starterRoot, "package.json"), "utf8"));
  const sdkReference = packageJson.dependencies?.["@game-fields/game-sdk"];
  if (typeof sdkReference !== "string" || !sdkReference.startsWith("file:vendor/")) {
    throw new Error("Starter package does not install the bundled SDK tarball.");
  }
  if (!existsSync(join(starterRoot, sdkReference.slice("file:".length)))) {
    throw new Error("Bundled SDK tarball is missing.");
  }
  const starterManifest = JSON.parse(readFileSync(join(starterRoot, "starter-manifest.json"), "utf8"));
  if (starterManifest.repository !== "https://github.com/koromo2010/app-games"
    || starterManifest.ref !== "sdk-starter"
    || starterManifest.sdkVersion !== "0.1.0"
    || starterManifest.platformVersion !== "0.1.0"
    || starterManifest.sdkContractVersion !== 1) {
    throw new Error("Starter manifest does not identify the expected public source and SDK version.");
  }

  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: starterRoot,
    stdio: "pipe",
    env: npmEnvironment,
  });
  execFileSync("npm", ["run", "check"], {
    cwd: starterRoot,
    stdio: "pipe",
    env: npmEnvironment,
  });
  const demo = execFileSync("npm", ["run", "demo"], {
    cwd: starterRoot,
    encoding: "utf8",
    env: npmEnvironment,
  });
  if (!demo.includes("ゲーム終了") || !demo.includes("revision: 5")) {
    throw new Error("Starter demo did not complete the expected game flow.");
  }

  execFileSync("npm", ["run", "package"], {
    cwd: starterRoot,
    stdio: "pipe",
    env: npmEnvironment,
  });
  const submissionRoot = join(fixtureRoot, "submission-extracted");
  const submissionEntries = extractStoredZip(
    join(starterRoot, "submission/game-fields-submission.zip"),
    submissionRoot,
  );
  for (const required of [
    "game-fields-submission/GAME_SPEC.md",
    "game-fields-submission/package.json",
    "game-fields-submission/src/server-module.ts",
    "game-fields-submission/tests/game-contract.test.ts",
    "game-fields-submission/vendor/game-fields-game-sdk-0.1.0.tgz",
  ]) {
    if (!submissionEntries.includes(required)) {
      throw new Error(`Submission archive is missing ${required}.`);
    }
  }
  if (submissionEntries.some((entry) => /(^|\/)(?:node_modules|dist|\.git|submission)(?:\/|$)/.test(entry.replace("game-fields-submission/", "")))) {
    throw new Error("Submission archive contains generated or repository-only directories.");
  }
  if (submissionEntries.some((entry) => entry.includes("apps/sdk-portal"))) {
    throw new Error("Submission archive contains the Vercel branch placeholder.");
  }

  execFileSync(process.execPath, [
    join(root, "scripts/build-game-sdk-starter-repository.mjs"),
    "--output",
    repositoryRoot,
  ], { cwd: root, stdio: "pipe", env: npmEnvironment });
  const extractedFiles = fileMap(starterRoot);
  for (const generated of ["node_modules", "dist", "submission", "package-lock.json"]) {
    for (const key of [...extractedFiles.keys()]) {
      if (key === generated || key.startsWith(`${generated}/`)) extractedFiles.delete(key);
    }
  }
  const repositoryFiles = fileMap(repositoryRoot);
  if (JSON.stringify([...repositoryFiles]) !== JSON.stringify([...extractedFiles])) {
    throw new Error("Public starter repository snapshot differs from the tested starter ZIP.");
  }

  const entryGuide = readFileSync(join(root, "sdk/entry/START_GAME_FIELDS.md"), "utf8");
  if (entryGuide.charCodeAt(0) !== 0xfeff) {
    throw new Error("Entry guide must start with a UTF-8 BOM to prevent mojibake in browser downloads.");
  }
  for (const requiredText of [
    "--branch sdk-starter",
    "https://github.com/koromo2010/app-games.git",
    "starter-manifest.json",
    "npm run check",
    "npm run demo",
    "npm run package",
    "submission/game-fields-submission.zip",
  ]) {
    if (!entryGuide.includes(requiredText)) {
      throw new Error(`Entry guide is missing required instruction: ${requiredText}`);
    }
  }

  console.log("[game-sdk-starter] 入口、公開Git用snapshot、ZIP展開、同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPを確認しました。");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
