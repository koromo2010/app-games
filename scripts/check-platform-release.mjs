import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const release = readJson("config/platform-release.json");
const packages = [
  ["package.json", readJson("package.json")],
  ["packages/game-sdk/package.json", readJson("packages/game-sdk/package.json")],
  ["packages/game-runtime/package.json", readJson("packages/game-runtime/package.json")],
  ["apps/sdk-portal/package.json", readJson("apps/sdk-portal/package.json")],
];
const failures = [];

if (!/^\d+\.\d+\.\d+$/.test(release.platformVersion)) {
  failures.push("platformVersion must be a semantic version such as 0.1.0.");
}
if (release.sdkPackageVersion !== release.platformVersion) {
  failures.push("sdkPackageVersion must match platformVersion for the current release train.");
}
if (!Number.isInteger(release.sdkContractVersion) || release.sdkContractVersion < 1) {
  failures.push("sdkContractVersion must be a positive integer.");
}
if (!release.supportedSdkContractVersions?.includes(release.sdkContractVersion)) {
  failures.push("supportedSdkContractVersions must include the current sdkContractVersion.");
}

for (const [path, packageJson] of packages) {
  if (packageJson.version !== release.platformVersion) {
    failures.push(`${path}: version ${packageJson.version} does not match platform ${release.platformVersion}.`);
  }
}

const runtimePackage = packages.find(([path]) => path === "packages/game-runtime/package.json")[1];
if (runtimePackage.dependencies?.["@game-fields/game-sdk"] !== release.sdkPackageVersion) {
  failures.push("packages/game-runtime/package.json must pin the SDK package from this platform release.");
}
const rootPackage = packages.find(([path]) => path === "package.json")[1];
if (rootPackage.dependencies?.["@game-fields/game-runtime"] !== release.platformVersion) {
  failures.push("package.json must pin the Game Runtime from this platform release.");
}

const packageLock = readJson("package-lock.json");
for (const workspacePath of ["", "apps/sdk-portal", "packages/game-sdk", "packages/game-runtime"]) {
  const lockedVersion = packageLock.packages?.[workspacePath]?.version;
  if (lockedVersion !== release.platformVersion) {
    failures.push(`package-lock.json workspace ${workspacePath || "root"} does not match platform ${release.platformVersion}.`);
  }
}

const sdkSource = readFileSync(join(root, "packages/game-sdk/src/index.ts"), "utf8");
const sdkContractMatch = sdkSource.match(/GAME_SDK_VERSION\s*=\s*(\d+)\s+as const/);
if (Number(sdkContractMatch?.[1]) !== release.sdkContractVersion) {
  failures.push("GAME_SDK_VERSION does not match sdkContractVersion.");
}

const runtimeSource = readFileSync(join(root, "packages/game-runtime/src/index.ts"), "utf8");
const roomSchemaMatch = runtimeSource.match(/GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION\s*=\s*(\d+)\s+as const/);
if (Number(roomSchemaMatch?.[1]) !== release.roomSchemaVersion) {
  failures.push("Runtime room schema constant does not match roomSchemaVersion.");
}

if (failures.length > 0) {
  console.error("\n[platform-release] Version consistency check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[platform-release] Platform v${release.platformVersion}, SDK contract v${release.sdkContractVersion}, room schema v${release.roomSchemaVersion}`);
