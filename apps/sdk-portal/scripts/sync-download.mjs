import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(appRoot, "../../sdk/entry/START_GAME_FIELDS.md");
const destination = resolve(appRoot, "public/DownloadMe.md");
const releaseSource = resolve(appRoot, "../../config/platform-release.json");
const releaseDestination = resolve(appRoot, "public/platform-release.json");
const release = JSON.parse(readFileSync(releaseSource, "utf8"));

mkdirSync(dirname(destination), { recursive: true });
const download = readFileSync(source, "utf8")
  .replaceAll("__PLATFORM_VERSION__", release.platformVersion)
  .replaceAll("__SDK_VERSION__", release.sdkPackageVersion)
  .replaceAll("__SDK_CONTRACT_VERSION__", String(release.sdkContractVersion));
writeFileSync(destination, download);
copyFileSync(releaseSource, releaseDestination);
console.log(`[sdk-portal] DownloadMe.md and release metadata synced for platform v${release.platformVersion}`);
