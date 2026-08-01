import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderSdkDownloadMe,
  resolveSdkReleaseProfile,
  sdkDownloadMeFileName,
  sdkDownloadMeVersion,
  validateSdkReleaseConfiguration,
} from "../packages/sdk-release-profiles/index.js";

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const release = readJson("config/platform-release.json");
const profileConfig = readJson("config/sdk-release-profiles.json");
const publishedRelease = readJson("apps/sdk-portal/public/platform-release.json");
const packages = [
  ["package.json", readJson("package.json")],
  ["packages/game-sdk/package.json", readJson("packages/game-sdk/package.json")],
  ["packages/game-runtime/package.json", readJson("packages/game-runtime/package.json")],
  ["packages/sdk-release-profiles/package.json", readJson("packages/sdk-release-profiles/package.json")],
  ["apps/sdk-portal/package.json", readJson("apps/sdk-portal/package.json")],
  ["apps/sdk-preview/package.json", readJson("apps/sdk-preview/package.json")],
  ["packages/sdk-preview-auth/package.json", readJson("packages/sdk-preview-auth/package.json")],
];
const failures = [];

try {
  validateSdkReleaseConfiguration(release, profileConfig);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (!Number.isInteger(release.sdkContractVersion) || release.sdkContractVersion < 1) {
  failures.push("sdkContractVersion must be a positive integer.");
}
if (!release.supportedSdkContractVersions?.includes(release.sdkContractVersion)) {
  failures.push("supportedSdkContractVersions must include the current sdkContractVersion.");
}
if (JSON.stringify(publishedRelease) !== JSON.stringify(release)) {
  failures.push("apps/sdk-portal/public/platform-release.json must exactly match config/platform-release.json.");
}

const entryTemplate = readFileSync(
  join(root, "sdk/entry/START_GAME_FIELDS.md"),
  "utf8",
);
for (const environment of ["production", "development"]) {
  try {
    const profile = resolveSdkReleaseProfile({
      release,
      profileConfig,
      requestedEnvironment: environment,
    });
    const fileName = sdkDownloadMeFileName(release, profile);
    const rendered = renderSdkDownloadMe(entryTemplate, release, profile);
    if (!rendered.includes(`# GF-AECP/${sdkDownloadMeVersion(release)}`)) {
      failures.push(`${environment} DownloadMe does not use the Platform SemVer.`);
    }
    if (!rendered.includes(`downloadMe: "${sdkDownloadMeVersion(release)}"`)) {
      failures.push(`${environment} DownloadMe release.downloadMe is not the Platform SemVer string.`);
    }
    if (!rendered.includes(`name: "${profile.pluginName}"`)
      || !rendered.includes(`${profile.pluginName} get_sdk_handshake`)) {
      failures.push(`${environment} DownloadMe does not use its configured plugin name.`);
    }
    if (!rendered.includes(profile.portalBaseUrl)
      || !rendered.includes(`ref: "${profile.starterRef}"`)
      || !rendered.includes(fileName)) {
      failures.push(`${environment} DownloadMe does not match its release profile.`);
    }
    const otherEnvironment = environment === "production" ? "development" : "production";
    const other = profileConfig.profiles[otherEnvironment];
    if (rendered.includes(`name: "${other.pluginName}"`)
      || rendered.includes(`portal: "${other.portalBaseUrl}"`)
      || rendered.includes(`ref: "${other.starterRef}"`)) {
      failures.push(`${environment} DownloadMe contains ${otherEnvironment} profile values.`);
    }
  } catch (error) {
    failures.push(`${environment} DownloadMe render failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const starterManifestTemplate = readFileSync(
  join(root, "sdk/starter-template/starter-manifest.json"),
  "utf8",
);
if (!starterManifestTemplate.includes('"downloadMeVersion": "__DOWNLOAD_ME_VERSION__"')) {
  failures.push("sdk/starter-template/starter-manifest.json must derive its SemVer DownloadMe version from Platform metadata.");
}
if (!starterManifestTemplate.includes('"environment": "__SDK_ENVIRONMENT__"')) {
  failures.push("sdk/starter-template/starter-manifest.json must identify its release environment.");
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
for (const workspacePath of [
  "",
  "apps/sdk-portal",
  "apps/sdk-preview",
  "packages/game-sdk",
  "packages/game-runtime",
  "packages/sdk-preview-auth",
  "packages/sdk-release-profiles",
]) {
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

const handshakeSource = readFileSync(join(root, "packages/game-sdk/src/handshake.ts"), "utf8");
const handshakeVersionMatch = handshakeSource.match(
  /GAME_FIELDS_SDK_HANDSHAKE_VERSION\s*=\s*(\d+)\s+as const/,
);
if (!Number.isInteger(release.sdkHandshakeVersion) || release.sdkHandshakeVersion < 1) {
  failures.push("sdkHandshakeVersion must be a positive integer.");
}
if (Number(handshakeVersionMatch?.[1]) !== release.sdkHandshakeVersion) {
  failures.push("GAME_FIELDS_SDK_HANDSHAKE_VERSION does not match sdkHandshakeVersion.");
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

const productionFile = sdkDownloadMeFileName(release, profileConfig.profiles.production);
const developmentFile = sdkDownloadMeFileName(release, profileConfig.profiles.development);
console.log(
  `[platform-release] Platform/DownloadMe v${sdkDownloadMeVersion(release)}, ${productionFile}, ${developmentFile}, SDK contract v${release.sdkContractVersion}, room schema v${release.roomSchemaVersion}`,
);
