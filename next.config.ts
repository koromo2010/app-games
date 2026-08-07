import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Legacy game aliases must be resolved before the generic slash redirect
  // so that old URLs reach their canonical play route in one hop.
  skipTrailingSlashRedirect: true,
  transpilePackages: ["@game-fields/sdk-service-auth"],
};

export default nextConfig;
