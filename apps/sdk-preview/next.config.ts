import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/server/**": [
      "../../node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm",
    ],
  },
  serverExternalPackages: ["quickjs-emscripten"],
  transpilePackages: ["@game-fields/game-sdk", "@game-fields/sdk-preview-auth"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
