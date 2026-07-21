const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@()+, -]*$/;
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

function sourceConfig() {
  const repository = process.env.SDK_MOCK_GITHUB_REPOSITORY ?? "";
  if (!REPOSITORY_PATTERN.test(repository)) throw new Error("SDK mock Git repository is not configured.");
  return {
    repository,
    token: process.env.SDK_MOCK_GITHUB_READ_TOKEN?.trim() || null,
  };
}

export function normalizePreviewAssetPath(parts: readonly string[]) {
  if (parts.length === 0) return "index.html";
  if (parts.length > 20) return null;
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.length > 120 || !SAFE_SEGMENT_PATTERN.test(part)) return null;
    normalized.push(part);
  }
  const path = normalized.join("/");
  return path.length <= 500 ? path : null;
}

export function previewContentType(path: string) {
  const fileName = path.toLowerCase();
  const extension = Object.keys(CONTENT_TYPES).find((candidate) => fileName.endsWith(candidate));
  return extension ? CONTENT_TYPES[extension] : "application/octet-stream";
}

export async function fetchPreviewAsset(input: {
  instanceId: string;
  gameId: string;
  revision: string;
  assetPath: string;
}) {
  const { repository, token } = sourceConfig();
  const repositoryPath = `previews/${input.instanceId}/${input.gameId}/mock/${input.assetPath}`;
  const encodedPath = repositoryPath.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${repository}/contents/${encodedPath}?ref=${input.revision}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "game-fields-sdk-preview",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
    redirect: "error",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("SDK preview source request failed.");

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_ASSET_BYTES) throw new Error("SDK preview asset is too large.");
  const content = await response.arrayBuffer();
  if (content.byteLength > MAX_ASSET_BYTES) throw new Error("SDK preview asset is too large.");
  return content;
}
