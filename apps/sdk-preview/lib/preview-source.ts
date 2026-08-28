const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@()+, -]*$/;
const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const SOURCE_BUDGET_MS = 4_500;

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

export class PreviewSourceError extends Error {
  readonly code:
    | "SDK_RUNTIME_ARTIFACT_COMMIT_NOT_FOUND"
    | "SDK_RUNTIME_ARTIFACT_SOURCE_TIMEOUT"
    | "SDK_RUNTIME_ARTIFACT_SOURCE_UNAVAILABLE"
    | "SDK_RUNTIME_ARTIFACT_TOO_LARGE";

  constructor(code: PreviewSourceError["code"]) {
    super(code);
    this.name = "PreviewSourceError";
    this.code = code;
  }
}

function sourceHeaders(token: string | null) {
  return {
    Accept: "application/vnd.github.raw+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "game-fields-sdk-preview",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchWithinSourceBudget(
  fetchSource: typeof fetch,
  url: string,
  headers: Record<string, string>,
  deadlineAt: number,
  controller: AbortController,
) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) {
    throw new PreviewSourceError("SDK_RUNTIME_ARTIFACT_SOURCE_TIMEOUT");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetchSource(url, {
        headers,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new PreviewSourceError("SDK_RUNTIME_ARTIFACT_SOURCE_TIMEOUT"));
        }, remaining);
      }),
    ]);
  } catch (error) {
    if (error instanceof PreviewSourceError) throw error;
    throw new PreviewSourceError("SDK_RUNTIME_ARTIFACT_SOURCE_UNAVAILABLE");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readAssetWithinSourceBudget(
  response: Response,
  deadlineAt: number,
  controller: AbortController,
) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) {
    throw new PreviewSourceError("SDK_RUNTIME_ARTIFACT_SOURCE_TIMEOUT");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.arrayBuffer(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new PreviewSourceError(
            "SDK_RUNTIME_ARTIFACT_SOURCE_TIMEOUT",
          ));
        }, remaining);
      }),
    ]);
  } catch (error) {
    if (error instanceof PreviewSourceError) throw error;
    if (controller.signal.aborted) {
      throw new PreviewSourceError("SDK_RUNTIME_ARTIFACT_SOURCE_TIMEOUT");
    }
    throw new PreviewSourceError("SDK_RUNTIME_ARTIFACT_SOURCE_UNAVAILABLE");
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  sourceKind?: "mock" | "package";
  classifyMissingRevision?: boolean;
  sourceBudgetMs?: number;
}, fetchSource: typeof fetch = fetch) {
  const { repository, token } = sourceConfig();
  const requestedBudget = Number.isSafeInteger(input.sourceBudgetMs)
    && Number(input.sourceBudgetMs) > 0
    ? Number(input.sourceBudgetMs)
    : SOURCE_BUDGET_MS;
  const deadlineAt = Date.now() + Math.min(SOURCE_BUDGET_MS, requestedBudget);
  const controller = new AbortController();
  const repositoryPath = input.sourceKind === "package"
    ? `packages/${input.instanceId}/${input.gameId}/bundle/${input.assetPath}`
    : `previews/${input.instanceId}/${input.gameId}/mock/${input.assetPath}`;
  const encodedPath = repositoryPath.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${repository}/contents/${encodedPath}?ref=${input.revision}`;
  const headers = sourceHeaders(token);
  const response = await fetchWithinSourceBudget(
    fetchSource,
    url,
    headers,
    deadlineAt,
    controller,
  );
  if (response.status === 404) {
    if (!input.classifyMissingRevision) return null;
    const commitUrl = `https://api.github.com/repos/${repository}/git/commits/${encodeURIComponent(input.revision)}`;
    const commitResponse = await fetchWithinSourceBudget(
      fetchSource,
      commitUrl,
      headers,
      deadlineAt,
      controller,
    );
    if (commitResponse.status === 404 || commitResponse.status === 422) {
      throw new PreviewSourceError("SDK_RUNTIME_ARTIFACT_COMMIT_NOT_FOUND");
    }
    if (!commitResponse.ok) {
      throw new PreviewSourceError("SDK_RUNTIME_ARTIFACT_SOURCE_UNAVAILABLE");
    }
    return null;
  }
  if (!response.ok) {
    throw new PreviewSourceError("SDK_RUNTIME_ARTIFACT_SOURCE_UNAVAILABLE");
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_ASSET_BYTES) {
    throw new PreviewSourceError("SDK_RUNTIME_ARTIFACT_TOO_LARGE");
  }
  const content = await readAssetWithinSourceBudget(
    response,
    deadlineAt,
    controller,
  );
  if (content.byteLength > MAX_ASSET_BYTES) {
    throw new PreviewSourceError("SDK_RUNTIME_ARTIFACT_TOO_LARGE");
  }
  return content;
}
