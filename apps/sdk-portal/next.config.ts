import { readdirSync } from "node:fs";
import type { NextConfig } from "next";
import {
  resolveSdkReleaseProfile,
  sdkDownloadMeFileName,
} from "@game-fields/sdk-release-profiles";
import platformRelease from "../../config/platform-release.json";
import profileConfig from "../../config/sdk-release-profiles.json";

const releaseProfile = resolveSdkReleaseProfile({
  release: platformRelease,
  profileConfig,
  requestedEnvironment: process.env.SDK_PORTAL_CHANNEL,
  gitRef: process.env.VERCEL_GIT_COMMIT_REF,
  portalBaseUrl: process.env.SDK_PORTAL_BASE_URL,
  defaultEnvironment: process.env.VERCEL ? undefined : "development",
});
const currentDownloadMeFileName = sdkDownloadMeFileName(
  platformRelease,
  releaseProfile,
);
const currentDownloadMePath = `/${currentDownloadMeFileName}`;
const historicalIntegerName = /^GameFieldsDownloadMe-ver\d+\.md$/;
const generatedSemverName =
  /^GameFieldsDownloadMe(?:-dev)?-ver\d+\.\d+\.\d+\.md$/;
const legacyDownloadMePaths = [...new Set([
  "/DownloadMe.md",
  "/GameFieldsDownloadMe.md",
  ...(["production", "development"] as const)
    .map((environment) => `/${sdkDownloadMeFileName(
      platformRelease,
      resolveSdkReleaseProfile({
        release: platformRelease,
        profileConfig,
        requestedEnvironment: environment,
      }),
    )}`)
    .filter((path) => path !== currentDownloadMePath),
  ...readdirSync(new URL("./public", import.meta.url))
    .filter((fileName) => fileName !== currentDownloadMeFileName)
    .filter((fileName) => historicalIntegerName.test(fileName) || generatedSemverName.test(fileName))
    .map((fileName) => `/${fileName}`),
])];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: [
    "@game-fields/sdk-preview-auth",
    "@game-fields/sdk-package-assets",
    "@game-fields/sdk-release-profiles",
    "@game-fields/sdk-runtime-artifact",
    "@game-fields/sdk-service-auth",
  ],
  async redirects() {
    return legacyDownloadMePaths.map((source) => ({
      source,
      destination: currentDownloadMePath,
      permanent: false,
    }));
  },
  async headers() {
    return [
      {
        source: currentDownloadMePath,
        headers: [
          {
            key: "Content-Disposition",
            value: `attachment; filename="${currentDownloadMeFileName}"`,
          },
          {
            key: "Content-Type",
            value: "text/markdown; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
