import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { extractStoredZip } from "./lib/stored-zip.mjs";

const root = resolve(import.meta.dirname, "..");
const outputFlag = process.argv.indexOf("--output");
const outputPath = resolve(
  root,
  outputFlag >= 0 && process.argv[outputFlag + 1]
    ? process.argv[outputFlag + 1]
    : "artifacts/game-fields-sdk-starter-repository",
);
const temporaryDirectory = mkdtempSync(join(tmpdir(), "game-fields-sdk-starter-repository-"));
const zipPath = join(temporaryDirectory, "starter.zip");
const extractRoot = join(temporaryDirectory, "extracted");
const allowedOutputRoots = [join(root, "artifacts"), resolve(tmpdir())];

const outputIsSafe = allowedOutputRoots.some((allowedRoot) => {
  const childPath = relative(allowedRoot, outputPath);
  return childPath !== "" && childPath !== ".." && !childPath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(childPath);
});
if (!outputIsSafe) {
  throw new Error("Output must be a child of the project artifacts directory or the system temporary directory.");
}

try {
  execFileSync(process.execPath, [
    join(root, "scripts/build-game-sdk-starter.mjs"),
    "--output",
    zipPath,
  ], { cwd: root, stdio: "pipe" });
  extractStoredZip(zipPath, extractRoot);
  const extractedStarter = join(extractRoot, "game-fields-sdk-starter");
  rmSync(outputPath, { recursive: true, force: true });
  cpSync(extractedStarter, outputPath, { recursive: true });
  console.log(`[game-sdk-starter-repository] ${outputPath}`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
