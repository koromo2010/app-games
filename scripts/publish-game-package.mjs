import { extname, relative, resolve } from "node:path";
import { readFileSync, readdirSync } from "node:fs";

const root = resolve(import.meta.dirname, "..");
const packageRoot = resolve(root, "game-package");
const portalUrl = process.env.GAME_FIELDS_SDK_URL?.replace(/\/$/, "") ?? "";
const instanceId = process.env.GAME_FIELDS_INSTANCE_ID?.trim().toLowerCase() ?? "";
const managementToken = process.env.GAME_FIELDS_MANAGEMENT_TOKEN ?? "";
const textExtensions = new Set([
  ".html", ".css", ".js", ".mjs", ".json", ".txt", ".svg", ".ts", ".tsx",
]);
const binaryExtensions = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2",
  ".mp3", ".ogg", ".wav",
]);

if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(portalUrl)) {
  throw new Error("GAME_FIELDS_SDK_URLが必要です。");
}
if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(instanceId)) {
  throw new Error("GAME_FIELDS_INSTANCE_IDが必要です。");
}
if (!managementToken) {
  throw new Error("GAME_FIELDS_MANAGEMENT_TOKENが必要です。値はGitや会話へ保存しないでください。");
}

const metadata = JSON.parse(
  readFileSync(resolve(packageRoot, "game-fields-package.json"), "utf8"),
);

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(absolutePath);
    const extension = extname(entry.name).toLowerCase();
    if (!textExtensions.has(extension) && !binaryExtensions.has(extension)) return [];
    const path = relative(packageRoot, absolutePath).replaceAll("\\", "/");
    if (textExtensions.has(extension)) {
      return [{
        path,
        content: readFileSync(absolutePath, "utf8"),
        encoding: "utf-8",
      }];
    }
    return [{
      path,
      content: readFileSync(absolutePath).toString("base64"),
      encoding: "base64",
    }];
  });
}

const response = await fetch(
  `${portalUrl}/api/instances/${instanceId}/games/${metadata.gameId}/package`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ files: collectFiles(packageRoot) }),
  },
);
const result = await response.json().catch(() => ({}));
if (!response.ok || result.saved !== true) {
  throw new Error(result.error || "ゲームパッケージをSDKへ保存できませんでした。");
}
if (
  result.serverBundleSha256 !== metadata.server.bundleSha256
  || result.appSetSourceSha256 !== metadata.server.appSetSourceSha256
) {
  throw new Error("SDKへの保存前後でAppSetまたはserver bundleのhashが変わりました。");
}
console.log(JSON.stringify(result));
