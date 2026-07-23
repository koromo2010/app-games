import { readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mockRoot = resolve(root, "mock");
const portalUrl = process.env.GAME_FIELDS_SDK_URL?.replace(/\/$/, "") ?? "";
const instanceId = process.env.GAME_FIELDS_INSTANCE_ID?.trim().toLowerCase() ?? "";
const managementToken = process.env.GAME_FIELDS_MANAGEMENT_TOKEN ?? "";
const textExtensions = new Set([".html", ".css", ".js", ".mjs", ".json", ".txt", ".svg"]);
const binaryExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".mp3", ".ogg", ".wav"]);

if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(portalUrl)) throw new Error("GAME_FIELDS_SDK_URLが必要です。");
if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(instanceId)) throw new Error("GAME_FIELDS_INSTANCE_IDが必要です。");
if (!managementToken) throw new Error("GAME_FIELDS_MANAGEMENT_TOKENが必要です。値はGitや会話へ保存しないでください。");

const metadata = JSON.parse(readFileSync(resolve(mockRoot, "preview.json"), "utf8"));
if (!/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/.test(metadata.gameId ?? "")) throw new Error("mock/preview.jsonのgameIdが不正です。");
if (typeof metadata.title !== "string" || !metadata.title.trim()) throw new Error("mock/preview.jsonのtitleが必要です。");

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(absolutePath);
    const extension = extname(entry.name).toLowerCase();
    if (!textExtensions.has(extension) && !binaryExtensions.has(extension)) return [];
    const path = relative(mockRoot, absolutePath).replaceAll("\\", "/");
    if (textExtensions.has(extension)) return [{ path, content: readFileSync(absolutePath, "utf8"), encoding: "utf-8" }];
    return [{ path, content: readFileSync(absolutePath).toString("base64"), encoding: "base64" }];
  });
}

const response = await fetch(`${portalUrl}/api/instances/${instanceId}/games/${metadata.gameId}/mock`, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${managementToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    title: metadata.title,
    description: typeof metadata.description === "string" ? metadata.description : "",
    files: collectFiles(mockRoot),
  }),
});
const result = await response.json().catch(() => ({}));
if (!response.ok || result.saved !== true) throw new Error(result.error || "モックをSDKへ保存できませんでした。");
if (typeof result.creatorUrl !== "string" || !/^https:\/\/[^/]+\/[a-z0-9-]+\/$/.test(result.creatorUrl)) {
  throw new Error("SDKへの保存結果に有効なcreatorUrlがありません。");
}
if (typeof result.previewUrl !== "string" || !/^https:\/\/[^/]+\/.+\/(?:mock|games)\/.+/.test(result.previewUrl)) {
  throw new Error("SDKへの保存結果に有効なゲーム確認URLがありません。");
}
console.log(JSON.stringify({
  saved: true,
  gameId: result.gameId ?? metadata.gameId,
  creatorUrl: result.creatorUrl,
  gameUrl: result.gameUrl ?? result.previewUrl,
  previewUrl: result.previewUrl,
}));
console.log(`[mock] SDKへ保存しました: ${result.creatorUrl}`);
