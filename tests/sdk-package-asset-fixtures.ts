import { createHash } from "node:crypto";
import {
  prepareGamePackageUploadFiles,
  type MockUploadFile,
  type PreparedUploadFile,
} from "../apps/sdk-portal/lib/mock-git-store.ts";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

export function sdkPackageAssetFixture(
  replacements: Record<string, string> = {},
  remove: readonly string[] = [],
): PreparedUploadFile[] {
  const serverBundle = "globalThis.GameFieldsServerBundle={};";
  const appSetSource = "export const appSet = {};\n";
  const manifest = {
    schemaVersion: 1,
    gameId: "portable-fixture",
    sdkPackageVersion: "0.1.1",
    sdkContractVersion: 1,
    manifest: {
      sdkVersion: 1,
      id: "portable-fixture",
      title: { ja: "fixture", en: "Fixture" },
      playMode: "online-room",
      minimumPlayers: 1,
      maximumPlayers: 4,
      supportsDebug: true,
      supportsSpectators: false,
      supportsReplay: false,
      supportsRating: false,
      usesLlm: false,
      settings: [],
    },
    client: { entry: "index.html" },
    server: {
      entry: "server.bundle.js",
      bundleSha256: sha256(serverBundle),
      appSetSource: "source/app-set.ts",
      appSetSourceSha256: sha256(appSetSource),
    },
  };
  const values = new Map<string, MockUploadFile>([
    ["game-fields-package.json", { path: "game-fields-package.json", content: `${JSON.stringify(manifest)}\n`, encoding: "utf-8" }],
    ["index.html", { path: "index.html", content: "<!doctype html><link rel=\"stylesheet\" href=\"./assets/styles.css\"><img src=\"./assets/icon.png\" srcset=\"./assets/icon.png 1x, ./assets/icon@2x.png 2x\"><script type=\"module\" src=\"./client/main.js\"></script>", encoding: "utf-8" }],
    ["assets/styles.css", { path: "assets/styles.css", content: "@import './theme.css'; .icon{background:url('./icon.png')}", encoding: "utf-8" }],
    ["assets/theme.css", { path: "assets/theme.css", content: ":root{color:black}", encoding: "utf-8" }],
    ["assets/icon.png", { path: "assets/icon.png", content: PNG, encoding: "base64" }],
    ["assets/icon@2x.png", { path: "assets/icon@2x.png", content: PNG, encoding: "base64" }],
    ["client/main.js", { path: "client/main.js", content: "import './module.js'; const icon='./assets/icon.png'; new URL('../assets/icon.png', import.meta.url);", encoding: "utf-8" }],
    ["client/module.js", { path: "client/module.js", content: "export default true;", encoding: "utf-8" }],
    ["server.bundle.js", { path: "server.bundle.js", content: serverBundle, encoding: "utf-8" }],
    ["source/app-set.ts", { path: "source/app-set.ts", content: appSetSource, encoding: "utf-8" }],
    ["source/manifest.ts", { path: "source/manifest.ts", content: "export const manifest = {};\n", encoding: "utf-8" }],
    ["source/server-module.ts", { path: "source/server-module.ts", content: "export const serverModule = {};\n", encoding: "utf-8" }],
  ]);
  for (const [path, content] of Object.entries(replacements)) {
    const existing = values.get(path);
    values.set(path, { path, content, encoding: existing?.encoding ?? "utf-8" });
  }
  for (const path of remove) values.delete(path);
  return prepareGamePackageUploadFiles([...values.values()]);
}
