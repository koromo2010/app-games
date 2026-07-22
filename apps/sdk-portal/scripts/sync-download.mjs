import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(appRoot, "../../sdk/entry/START_GAME_FIELDS.md");
const destination = resolve(appRoot, "public/GameFieldsDownloadMe-ver2.md");
const releaseSource = resolve(appRoot, "../../config/platform-release.json");
const releaseDestination = resolve(appRoot, "public/platform-release.json");
const release = JSON.parse(readFileSync(releaseSource, "utf8"));
const gitRef = process.env.VERCEL_GIT_COMMIT_REF?.trim();
const requestedChannel = process.env.SDK_PORTAL_CHANNEL?.trim().toLowerCase();
const isProduction = requestedChannel
  ? requestedChannel === "production"
  : gitRef === "main";
const sdkChannel = isProduction ? "production" : "development";
const sdkPortalBaseUrl = isProduction
  ? "https://sdk.game-fields.com"
  : "https://sdk-dev.game-fields.com";

mkdirSync(dirname(destination), { recursive: true });
const download = readFileSync(source, "utf8")
  .replaceAll("__PLATFORM_VERSION__", release.platformVersion)
  .replaceAll("__SDK_VERSION__", release.sdkPackageVersion)
  .replaceAll("__SDK_CONTRACT_VERSION__", String(release.sdkContractVersion))
  .replaceAll("__SDK_PORTAL_BASE_URL__", sdkPortalBaseUrl);
writeFileSync(destination, download);
copyFileSync(releaseSource, releaseDestination);
console.log(
  `[sdk-portal] GameFieldsDownloadMe-ver2.md synced for ${sdkChannel} at ${sdkPortalBaseUrl} (platform v${release.platformVersion})`,
);
