import { readFileSync, writeFileSync } from "node:fs";

const downloadMePath = "apps/sdk-portal/public/GameFieldsDownloadMe-ver17.md";
let downloadMe = readFileSync(downloadMePath, "utf8");

const replacements = [
  ["  sdkContract: 1\n", "  sdkContract: 2\n"],
  ['    "sdkContractVersion": 1\n', '    "sdkContractVersion": 2\n'],
];

for (const [from, to] of replacements) {
  if (!downloadMe.includes(from)) {
    if (!downloadMe.includes(to)) {
      throw new Error(`Missing DownloadMe contract anchor: ${from.trim()}`);
    }
    continue;
  }
  downloadMe = downloadMe.replace(from, to);
}

writeFileSync(downloadMePath, downloadMe);

const testPath = "tests/sdk-release-contract-alignment.test.ts";
const test = `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const platformRelease = JSON.parse(readFileSync("config/platform-release.json", "utf8"));
const downloadMe = readFileSync("apps/sdk-portal/public/GameFieldsDownloadMe-ver17.md", "utf8");

function starterManifestFromGit() {
  const result = spawnSync(
    "git",
    ["show", "origin/sdk-starter-dev:starter-manifest.json"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || "Could not read sdk-starter-dev manifest");
  return JSON.parse(result.stdout);
}

test("DownloadMe ver17 matches the platform SDK contract release", () => {
  assert.match(downloadMe, /downloadMe:\\s+17/);
  assert.match(downloadMe, /sdkContract:\\s+2/);
  assert.match(downloadMe, /"sdkContractVersion":\\s*2/);
  assert.equal(platformRelease.downloadMeVersion, 17);
  assert.equal(platformRelease.sdkContractVersion, 2);
  assert.ok(platformRelease.supportedSdkContractVersions.includes(2));
});

test("sdk-starter-dev manifest matches DownloadMe ver17 and platform release", () => {
  const starter = starterManifestFromGit();
  assert.equal(starter.downloadMeVersion, platformRelease.downloadMeVersion);
  assert.equal(starter.sdkContractVersion, platformRelease.sdkContractVersion);
  assert.equal(starter.sdkHandshakeVersion, platformRelease.sdkHandshakeVersion ?? 1);
  assert.equal(starter.platformVersion, platformRelease.platformVersion);
  assert.equal(starter.sdkVersion, platformRelease.sdkPackageVersion);
  assert.equal(starter.ref, "sdk-starter-dev");
});
`;
writeFileSync(testPath, test);
