import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { writeStoredZip } from "./stored-zip.mjs";

const root = resolve(import.meta.dirname, "..");
const outputPath = join(root, "submission/game-fields-submission.zip");
const archiveRoot = "game-fields-submission";
const requiredPaths = [
  ".gitignore",
  "AGENTS.md",
  "GAME_SPEC.md",
  "README.md",
  "SDK_API.md",
  "SDK_REQUESTS.md",
  "START_HERE.md",
  "SUBMISSION_CHECKLIST.md",
  "package.json",
  "starter-manifest.json",
  "tsconfig.json",
  "scripts",
  "src",
  "tests",
  "vendor",
];

function collect(absolutePath) {
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink()) throw new Error(`Symbolic links cannot be submitted: ${absolutePath}`);
  if (stat.isDirectory()) {
    return readdirSync(absolutePath, { withFileTypes: true })
      .filter((entry) => entry.name !== "submission")
      .flatMap((entry) => collect(join(absolutePath, entry.name)));
  }
  if (!stat.isFile()) throw new Error(`Unsupported submission entry: ${absolutePath}`);
  return [absolutePath];
}

const optionalLock = join(root, "package-lock.json");
const sourcePaths = requiredPaths.map((path) => join(root, path));
try {
  if (lstatSync(optionalLock).isFile()) sourcePaths.push(optionalLock);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const entries = sourcePaths
  .flatMap(collect)
  .map((absolutePath) => ({
    name: `${archiveRoot}/${relative(root, absolutePath).replaceAll("\\", "/")}`,
    content: readFileSync(absolutePath),
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

writeStoredZip(outputPath, entries);
console.log(`[game-fields-submission] ${outputPath}`);
console.log(`[game-fields-submission] ${entries.length} files`);
