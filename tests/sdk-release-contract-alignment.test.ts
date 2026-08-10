import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  renderSdkDownloadMe,
  renderSdkOnboardingTemplate,
  resolveSdkReleaseProfile,
  sdkDownloadMeFileName,
  sdkDownloadMeVersion,
} from "../packages/sdk-release-profiles/index.js";

const appRelease = JSON.parse(readFileSync("config/app-release.json", "utf8"));
const platformRelease = JSON.parse(readFileSync("config/platform-release.json", "utf8"));
const profileConfig = JSON.parse(readFileSync("config/sdk-release-profiles.json", "utf8"));
const template = readFileSync("sdk/entry/START_GAME_FIELDS.md", "utf8");
const claudeCodeTemplate = readFileSync("sdk/entry/START_CLAUDE_CODE.md", "utf8");

test("DownloadMe uses the Platform SemVer and SDK contract release", () => {
  assert.equal(platformRelease.platformVersion, appRelease.version);
  assert.equal(sdkDownloadMeVersion(platformRelease), platformRelease.platformVersion);
  assert.equal(platformRelease.sdkContractVersion, 2);
  assert.ok(platformRelease.supportedSdkContractVersions.includes(2));
  assert.equal(Object.hasOwn(platformRelease, "downloadMeVersion"), false);
});

test("production and development DownloadMe contracts stay environment-pure", () => {
  const production = resolveSdkReleaseProfile({
    release: platformRelease,
    profileConfig,
    requestedEnvironment: "production",
  });
  const development = resolveSdkReleaseProfile({
    release: platformRelease,
    profileConfig,
    requestedEnvironment: "development",
  });
  const productionDownload = renderSdkDownloadMe(template, platformRelease, production);
  const developmentDownload = renderSdkDownloadMe(template, platformRelease, development);
  const productionClaudeCode = renderSdkOnboardingTemplate(
    claudeCodeTemplate,
    platformRelease,
    production,
  );
  const developmentClaudeCode = renderSdkOnboardingTemplate(
    claudeCodeTemplate,
    platformRelease,
    development,
  );

  assert.equal(sdkDownloadMeFileName(platformRelease, production), "GameFieldsDownloadMe-ver0.2.0.md");
  assert.equal(sdkDownloadMeFileName(platformRelease, development), "GameFieldsDownloadMe-dev-ver0.2.0.md");
  assert.match(productionDownload, /name: "game-fields"/);
  assert.match(productionDownload, /https:\/\/sdk\.game-fields\.com/);
  assert.match(productionDownload, /ref: "sdk-starter"/);
  assert.match(productionDownload, /「新規プラグイン」/);
  assert.match(productionDownload, /名前を`game-fields`/);
  assert.match(productionDownload, /MCP URLを`https:\/\/sdk\.game-fields\.com\/api\/mcp`/);
  assert.match(productionDownload, /「接続」.*OAuth認証.*「更新」/);
  for (const capability of [
    "game-draft",
    "module-first-authoring",
    "module-usage-validation",
    "node-free-package",
  ]) {
    assert.match(productionDownload, new RegExp(capability));
    assert.match(developmentDownload, new RegExp(capability));
    assert.match(productionClaudeCode, new RegExp(capability));
    assert.match(developmentClaudeCode, new RegExp(capability));
  }
  assert.doesNotMatch(productionDownload, /dev-game-fields|sdk-dev\.game-fields\.com|ref: "sdk-starter-dev"/);
  assert.match(developmentDownload, /name: "dev-game-fields"/);
  assert.match(developmentDownload, /https:\/\/sdk-dev\.game-fields\.com/);
  assert.match(developmentDownload, /名前を`dev-game-fields`/);
  assert.match(developmentDownload, /MCP URLを`https:\/\/sdk-dev\.game-fields\.com\/api\/mcp`/);
  assert.match(developmentDownload, /ref: "sdk-starter-dev"/);
  assert.doesNotMatch(developmentDownload, /name: "game-fields"|portal: "https:\/\/sdk\.game-fields\.com"|ref: "sdk-starter"/);
  assert.match(productionClaudeCode, /TARGET_ENVIRONMENT := production/);
  assert.match(productionClaudeCode, /https:\/\/sdk\.game-fields\.com\/api\/mcp/);
  assert.doesNotMatch(productionClaudeCode, /sdk-dev\.game-fields\.com|dev-game-fields/);
  assert.match(developmentClaudeCode, /TARGET_ENVIRONMENT := development/);
  assert.match(developmentClaudeCode, /https:\/\/sdk-dev\.game-fields\.com\/api\/mcp/);
  assert.doesNotMatch(developmentClaudeCode, /https:\/\/sdk\.game-fields\.com\/api\/mcp/);
});
