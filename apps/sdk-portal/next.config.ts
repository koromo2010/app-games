import type { NextConfig } from "next";

const currentDownloadMePath = "/GameFieldsDownloadMe-ver9.md";
const legacyDownloadMePaths = [
  "/DownloadMe.md",
  "/GameFieldsDownloadMe.md",
  ...Array.from(
    { length: 8 },
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
            value: 'attachment; filename="GameFieldsDownloadMe-ver9.md"',
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
