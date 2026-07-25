import { spawnSync } from "node:child_process";

const isDevelopmentAppBuild =
  process.env.VERCEL_PROJECT_NAME === "app-games-dev"
  && process.env.VERCEL_GIT_COMMIT_REF === "develop";

if (!isDevelopmentAppBuild) {
  process.stdout.write("[general-game-classification] skipped outside app-games-dev/develop\n");
  process.exit(0);
}

const apply = process.argv.includes("--apply");
const childEnvironment = { ...process.env };
let sourceMode = "LEGACY_WORD_DATABASE_URL";
if (!childEnvironment.LEGACY_WORD_DATABASE_URL?.trim() && childEnvironment.DATABASE_URL?.trim()) {
  childEnvironment.LEGACY_WORD_DATABASE_URL = childEnvironment.DATABASE_URL;
  sourceMode = "DATABASE_URL compatibility fallback";
}
process.stdout.write(`[general-game-classification] source=${sourceMode}\n`);
const args = [
  "--experimental-strip-types",
  "scripts/import-legacy-general-game-classifications.ts",
  ...(apply ? ["--apply"] : []),
];
const result = spawnSync(process.execPath, args, {
  cwd: process.cwd(),
  env: childEnvironment,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
