import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderSdkOnboardingTemplate,
  resolveSdkReleaseProfile,
  sdkClaudeCodeProfileFileName,
  sdkDownloadMeFileName,
} from "@game-fields/sdk-release-profiles";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(appRoot, "../..");
const publicRoot = resolve(appRoot, "public");
const source = resolve(repositoryRoot, "sdk/entry/START_GAME_FIELDS.md");
const claudeCodeSource = resolve(repositoryRoot, "sdk/entry/START_CLAUDE_CODE.md");
const releaseSource = resolve(repositoryRoot, "config/platform-release.json");
const profilesSource = resolve(repositoryRoot, "config/sdk-release-profiles.json");
const releaseDestination = resolve(publicRoot, "platform-release.json");
const release = JSON.parse(readFileSync(releaseSource, "utf8"));
const profileConfig = JSON.parse(readFileSync(profilesSource, "utf8"));
const environmentFlag = process.argv.indexOf("--environment");
const requestedEnvironment = environmentFlag >= 0
  ? process.argv[environmentFlag + 1]
  : process.env.SDK_PORTAL_CHANNEL;
const profile = resolveSdkReleaseProfile({
  release,
  profileConfig,
  requestedEnvironment,
  gitRef: process.env.VERCEL_GIT_COMMIT_REF,
  portalBaseUrl: process.env.SDK_PORTAL_BASE_URL,
  defaultEnvironment: process.env.VERCEL ? undefined : "development",
});
const downloadMeFileName = sdkDownloadMeFileName(release, profile);
const destination = resolve(publicRoot, downloadMeFileName);
const claudeCodeProfileFileName = sdkClaudeCodeProfileFileName(release, profile);
const claudeCodeDestination = resolve(publicRoot, claudeCodeProfileFileName);
const generatedDownloadMePattern =
  /^GameFieldsDownloadMe(?:-dev)?-ver\d+\.\d+\.\d+\.md$/;
const generatedClaudeCodeProfilePattern =
  /^GameFieldsClaudeCode(?:-dev)?-ver\d+\.\d+\.\d+\.md$/;

mkdirSync(publicRoot, { recursive: true });
for (const fileName of readdirSync(publicRoot)) {
  if (generatedDownloadMePattern.test(fileName) || generatedClaudeCodeProfilePattern.test(fileName)) {
    rmSync(resolve(publicRoot, fileName));
  }
}

const download = renderSdkOnboardingTemplate(
  readFileSync(source, "utf8"),
  release,
  profile,
);
writeFileSync(destination, download);
writeFileSync(
  claudeCodeDestination,
  renderSdkOnboardingTemplate(
    readFileSync(claudeCodeSource, "utf8"),
    release,
    profile,
  ),
);
copyFileSync(releaseSource, releaseDestination);
console.log(
  `[sdk-portal] ${downloadMeFileName} and ${claudeCodeProfileFileName} synced for ${profile.environment} via ${profile.pluginName} at ${profile.portalBaseUrl} (platform v${release.platformVersion})`,
);
