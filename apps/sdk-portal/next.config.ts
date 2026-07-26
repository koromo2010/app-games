import type { NextConfig } from "next";
import platformRelease from "../../config/platform-release.json";

const currentDownloadMeFileName =
  `GameFieldsDownloadMe-ver${platformRelease.downloadMeVersion}.md`;
const currentDownloadMePath = `/${currentDownloadMeFileName}`;
const legacyDownloadMePaths = [
  "/DownloadMe.md",
  "/GameFieldsDownloadMe.md",
  ...Array.from(
    { length: platformRelease.downloadMeVersion - 1 },
    (_, index) => `/GameFieldsDownloadMe-ver${index + 1}.md`,
  ),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@game-fields/sdk-preview-auth"],
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
