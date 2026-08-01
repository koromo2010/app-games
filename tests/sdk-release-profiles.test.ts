import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveSdkReleaseEnvironment,
  resolveSdkReleaseProfile,
  sdkDownloadMeFileName,
  validateSdkReleaseConfiguration,
} from "../packages/sdk-release-profiles/index.js";
import platformRelease from "../config/platform-release.json" with { type: "json" };
import profileConfig from "../config/sdk-release-profiles.json" with { type: "json" };

test("release profiles resolve canonical production and development inputs", () => {
  validateSdkReleaseConfiguration(platformRelease, profileConfig);
  assert.equal(resolveSdkReleaseEnvironment({
    profileConfig,
    requestedEnvironment: "production",
  }), "production");
  assert.equal(resolveSdkReleaseEnvironment({
    profileConfig,
    gitRef: "develop",
  }), "development");
  assert.equal(resolveSdkReleaseEnvironment({
    profileConfig,
    portalBaseUrl: "https://sdk.game-fields.com",
  }), "production");
});

test("release profile resolution fails closed for unknown explicit inputs", () => {
  assert.throws(() => resolveSdkReleaseEnvironment({
    profileConfig,
    requestedEnvironment: "preview",
  }), /Unknown SDK release environment/);
  assert.throws(() => resolveSdkReleaseEnvironment({
    profileConfig,
    gitRef: "feature/downloadme",
  }), /Unsupported SDK Portal Git ref/);
  assert.throws(() => resolveSdkReleaseEnvironment({
    profileConfig,
    portalBaseUrl: "https://unexpected.example.com",
  }), /Unknown SDK Portal origin/);
  assert.throws(() => resolveSdkReleaseEnvironment({
    profileConfig,
    requestedEnvironment: "production",
    gitRef: "develop",
  }), /Conflicting SDK release environment signals/);
});

test("future DownloadMe filenames follow Platform SemVer without another counter", () => {
  const futureRelease = {
    ...platformRelease,
    platformVersion: "0.2.0",
    sdkPackageVersion: "0.2.0",
  };
  const production = resolveSdkReleaseProfile({
    release: futureRelease,
    profileConfig,
    requestedEnvironment: "production",
  });
  const development = resolveSdkReleaseProfile({
    release: futureRelease,
    profileConfig,
    requestedEnvironment: "development",
  });
  assert.equal(sdkDownloadMeFileName(futureRelease, production), "GameFieldsDownloadMe-ver0.2.0.md");
  assert.equal(sdkDownloadMeFileName(futureRelease, development), "GameFieldsDownloadMe-dev-ver0.2.0.md");
});
