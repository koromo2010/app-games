import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { extractStoredZip } from "./lib/stored-zip.mjs";

const root = resolve(import.meta.dirname, "..");
const fixtureRoot = mkdtempSync(join(tmpdir(), "game-fields-sdk-starter-check-"));
const zipPath = join(fixtureRoot, "starter.zip");
const extractRoot = join(fixtureRoot, "extracted");
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(fixtureRoot, "npm-cache"),
};

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
    "SDK_API.md",
    "SUBMISSION_CHECKLIST.md",
    "package.json",
    "src/manifest.ts",
    "src/contracts.ts",
    "src/server-module.ts",
    "tests/game-contract.test.ts",
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

  console.log("[game-sdk-starter] ZIP展開、同梱SDK install、型検査、契約テスト、1ゲーム完走を確認しました。");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
