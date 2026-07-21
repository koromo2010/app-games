import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { writeStoredZip } from "./lib/stored-zip.mjs";

const root = resolve(import.meta.dirname, "..");
const sdkRoot = join(root, "packages/game-sdk");
const templateRoot = join(root, "sdk/starter-template");
const packageJson = JSON.parse(readFileSync(join(sdkRoot, "package.json"), "utf8"));
const version = packageJson.version;
const platformRelease = JSON.parse(
  readFileSync(join(root, "config/platform-release.json"), "utf8"),
);
const archiveRoot = "game-fields-sdk-starter";
const temporaryDirectory = mkdtempSync(join(tmpdir(), "game-fields-sdk-download-"));
const outputFlag = process.argv.indexOf("--output");
const outputPath = resolve(
  root,
  outputFlag >= 0 && process.argv[outputFlag + 1]
    ? process.argv[outputFlag + 1]
    : `artifacts/game-fields-sdk-starter-v${version}.zip`,
);

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(absolutePath) : [absolutePath];
    });
}

try {
  const packJson = execFileSync(
    "npm",
    ["pack", sdkRoot, "--json", "--pack-destination", temporaryDirectory],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: join(temporaryDirectory, "npm-cache") },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const [packResult] = JSON.parse(packJson);
  if (!packResult?.filename) throw new Error("SDK tarball was not created.");

  const replacements = new Map([
    ["__SDK_VERSION__", version],
    ["__PLATFORM_VERSION__", platformRelease.platformVersion],
    ["__SDK_CONTRACT_VERSION__", String(platformRelease.sdkContractVersion)],
    ["__SDK_TARBALL__", packResult.filename],
  ]);
  const entries = collectFiles(templateRoot).map((absolutePath) => {
    const templatePath = relative(templateRoot, absolutePath).replaceAll("\\", "/");
    let content = readFileSync(absolutePath, "utf8");
    for (const [token, value] of replacements) content = content.replaceAll(token, value);
    return { name: `${archiveRoot}/${templatePath}`, content };
  });
  entries.push({
    name: `${archiveRoot}/vendor/${basename(packResult.filename)}`,
    content: readFileSync(join(temporaryDirectory, packResult.filename)),
  });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  writeStoredZip(outputPath, entries);

  const size = statSync(outputPath).size;
  console.log(`[game-sdk-starter] ${outputPath}`);
  console.log(`[game-sdk-starter] SDK v${version}, ${entries.length} files, ${size} bytes`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
