import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@game-fields/sdk-preview-auth"],
  async headers() {
    return [
      {
        source: "/GameFieldsDownloadMe.md",
        headers: [
          {
            key: "Content-Disposition",
            value: 'attachment; filename="GameFieldsDownloadMe.md"',
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
