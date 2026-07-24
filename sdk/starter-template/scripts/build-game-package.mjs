import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { build } from "esbuild";
import { assertPromotionReady } from "./promotion-readiness.mjs";

const root = resolve(import.meta.dirname, "..");
const outputRoot = join(root, "game-package");
const serverBundlePath = join(outputRoot, "server.bundle.js");
const appSetSourcePath = join(root, "src/app-set.ts");
const starterManifest = JSON.parse(
  readFileSync(join(root, "starter-manifest.json"), "utf8"),
);
const previewManifest = JSON.parse(
  readFileSync(join(root, "mock/preview.json"), "utf8"),
);

execFileSync("npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
});

const serverExports = await import(
  `${pathToFileURL(join(root, "dist/src/server-module.js")).href}?package=${Date.now()}`
);
const serverModule = Object.values(serverExports).find((value) => (
  value
  && typeof value === "object"
  && "manifest" in value
  && typeof value.createRoom === "function"
  && typeof value.applyCommand === "function"
  && typeof value.presentRoom === "function"
));
if (!serverModule) {
  throw new Error("GAME_SDK_PACKAGE_SERVER_MODULE_NOT_FOUND");
}
assertPromotionReady({ root, previewManifest, serverModule });

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });
cpSync(join(root, "mock"), outputRoot, { recursive: true });
for (const sourceName of [
  "app-set.ts",
  "contracts.ts",
  "manifest.ts",
  "server-module.ts",
]) {
  const source = join(root, "src", sourceName);
  const destination = join(outputRoot, "source", sourceName);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}

await build({
  absWorkingDir: root,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  outfile: serverBundlePath,
  stdin: {
    contents: [
      'import { installGameSdkPortableServer } from "@game-fields/game-sdk/portable-server";',
      'import * as serverExports from "./dist/src/server-module.js";',
      "const serverModule = Object.values(serverExports).find((value) => value && typeof value === 'object' && value.manifest && typeof value.createRoom === 'function' && typeof value.applyCommand === 'function' && typeof value.presentRoom === 'function');",
      "if (!serverModule) throw new Error('GAME_SDK_PACKAGE_SERVER_MODULE_NOT_FOUND');",
      "installGameSdkPortableServer(serverModule);",
    ].join("\n"),
    loader: "js",
    resolveDir: root,
    sourcefile: "game-fields-portable-entry.js",
  },
});

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const packageManifest = {
  schemaVersion: 1,
  gameId: serverModule.manifest.id,
  sdkPackageVersion: starterManifest.sdkVersion,
  sdkContractVersion: starterManifest.sdkContractVersion,
  manifest: serverModule.manifest,
  client: {
    entry: "index.html",
  },
  server: {
    entry: "server.bundle.js",
    bundleSha256: sha256(serverBundlePath),
    appSetSource: "source/app-set.ts",
    appSetSourceSha256: sha256(appSetSourcePath),
  },
};
writeFileSync(
  join(outputRoot, "game-fields-package.json"),
  `${JSON.stringify(packageManifest, null, 2)}\n`,
);

console.log(JSON.stringify({
  built: true,
  gameId: packageManifest.gameId,
  output: outputRoot,
  serverBundleSha256: packageManifest.server.bundleSha256,
  appSetSourceSha256: packageManifest.server.appSetSourceSha256,
}));
