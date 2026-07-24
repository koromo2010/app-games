const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const INSTANCE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@()+, -]*$/;
const ALLOWED_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".mjs", ".json", ".txt", ".svg", ".png", ".jpg", ".jpeg",
  ".webp", ".gif", ".ico", ".woff", ".woff2", ".mp3", ".ogg", ".wav", ".ts", ".tsx",
]);
const REQUIRED_FILES = new Set(["index.html", "styles.css", "mock.js"]);
const REQUIRED_PACKAGE_FILES = new Set([
  "game-fields-package.json",
  "index.html",
  "server.bundle.js",
  "source/app-set.ts",
  "source/manifest.ts",
  "source/server-module.ts",
]);
const MAX_FILES = 32;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

export type MockUploadFile = {
  path: string;
  content: string;
  encoding?: "utf-8" | "base64";
};

export type PreparedUploadFile = Required<MockUploadFile> & { bytes: number };
type MockUploadFileMap = Record<string, string>;

class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("SDK mock Git request failed.");
    this.status = status;
  }
}

function mockGitConfig() {
  const repository = process.env.SDK_MOCK_GITHUB_REPOSITORY ?? "";
  const branch = process.env.SDK_MOCK_GITHUB_BRANCH?.trim() || "sdk-previews";
  const token = process.env.SDK_MOCK_GITHUB_WRITE_TOKEN ?? "";
  const missing = [
    !REPOSITORY_PATTERN.test(repository) ? "SDK_MOCK_GITHUB_REPOSITORY" : "",
    !BRANCH_PATTERN.test(branch) ? "SDK_MOCK_GITHUB_BRANCH" : "",
    !token ? "SDK_MOCK_GITHUB_WRITE_TOKEN" : "",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`SDK mock Git storage is not configured (${missing.join(", ")}).`);
  }
  return { repository, branch, token };
}

function safeRelativePath(path: string) {
  if (!path || path.length > 500 || path.startsWith("/") || path.endsWith("/")) return false;
  const parts = path.split("/");
  if (parts.length > 20) return false;
  return parts.every((part) => part !== "." && part !== ".." && part.length <= 120 && SAFE_SEGMENT_PATTERN.test(part));
}

function fileExtension(path: string) {
  const fileName = path.toLowerCase();
  return [...ALLOWED_EXTENSIONS].find((extension) => fileName.endsWith(extension)) ?? "";
}

function normalizeMockUploadFiles(value: unknown): unknown {
  if (Array.isArray(value) || !value || typeof value !== "object") return value;
  return Object.entries(value as MockUploadFileMap).map(([path, content]) => ({
    path,
    content,
    encoding: "utf-8" as const,
  }));
}

function prepareUploadFiles(input: {
  value: unknown;
  requiredFiles: ReadonlySet<string>;
  maximumFiles: number;
  label: "Mock" | "Game package";
}): PreparedUploadFile[] {
  const normalizedValue = normalizeMockUploadFiles(input.value);
  if (!Array.isArray(normalizedValue) || normalizedValue.length === 0 || normalizedValue.length > input.maximumFiles) {
    throw new Error(`${input.label} upload must contain between 1 and ${input.maximumFiles} files.`);
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  const files = normalizedValue.map((item): PreparedUploadFile => {
    if (!item || typeof item !== "object") throw new Error("Mock upload file is invalid.");
    const candidate = item as Partial<MockUploadFile>;
    const path = typeof candidate.path === "string" ? candidate.path : "";
    if (typeof candidate.content !== "string") throw new Error("Mock upload file is invalid.");
    const content = candidate.content;
    const encoding = candidate.encoding ?? "utf-8";
    if (!safeRelativePath(path) || !fileExtension(path) || seen.has(path)) throw new Error("Mock upload path is invalid.");
    if (encoding !== "utf-8" && encoding !== "base64") throw new Error("Mock upload encoding is invalid.");
    if (encoding === "base64" && (content.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content))) {
      throw new Error("Mock upload base64 content is invalid.");
    }
    const bytes = encoding === "base64" ? Buffer.from(content, "base64").byteLength : Buffer.byteLength(content, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new Error("Mock upload file is too large.");
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Mock upload is too large.");
    seen.add(path);
    return { path, content, encoding, bytes };
  });
  for (const required of input.requiredFiles) {
    if (!seen.has(required)) throw new Error(`${input.label} upload is missing ${required}.`);
  }
  return files;
}

export function prepareMockUploadFiles(value: unknown) {
  return prepareUploadFiles({
    value,
    requiredFiles: REQUIRED_FILES,
    maximumFiles: MAX_FILES,
    label: "Mock",
  });
}

export function prepareGamePackageUploadFiles(value: unknown) {
  return prepareUploadFiles({
    value,
    requiredFiles: REQUIRED_PACKAGE_FILES,
    maximumFiles: 128,
    label: "Game package",
  });
}

async function githubApi<T>(config: ReturnType<typeof mockGitConfig>, path: string, init?: RequestInit) {
  const response = await fetch(`https://api.github.com/repos/${config.repository}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "game-fields-sdk-portal",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) throw new GitHubApiError(response.status);
  return response.json() as Promise<T>;
}

async function ensureBranch(config: ReturnType<typeof mockGitConfig>) {
  try {
    const ref = await githubApi<{ object: { sha: string } }>(config, `/git/ref/heads/${config.branch}`);
    return ref.object.sha;
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
  }
  const repository = await githubApi<{ default_branch: string }>(config, "");
  const base = await githubApi<{ object: { sha: string } }>(config, `/git/ref/heads/${repository.default_branch}`);
  try {
    await githubApi(config, "/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${config.branch}`, sha: base.object.sha }),
    });
    return base.object.sha;
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
    const ref = await githubApi<{ object: { sha: string } }>(config, `/git/ref/heads/${config.branch}`);
    return ref.object.sha;
  }
}

async function saveFilesToGit(input: {
  instanceId: string;
  gameId: string;
  files: readonly PreparedUploadFile[];
  prefix: string;
  message: string;
}) {
  if (!INSTANCE_PATTERN.test(input.instanceId) || !GAME_PATTERN.test(input.gameId)) {
    throw new Error("SDK mock storage scope is invalid.");
  }
  const config = mockGitConfig();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parentSha = await ensureBranch(config);
    const parent = await githubApi<{ tree: { sha: string } }>(config, `/git/commits/${parentSha}`);
    const blobs = await Promise.all(input.files.map((file) => githubApi<{ sha: string }>(config, "/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding: file.encoding }),
    })));
    const packageTree = await githubApi<{ sha: string }>(config, "/git/trees", {
      method: "POST",
      body: JSON.stringify({
        tree: input.files.map((file, index) => ({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blobs[index].sha,
        })),
      }),
    });
    const tree = await githubApi<{ sha: string }>(config, "/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: [{
          path: input.prefix,
          mode: "040000",
          type: "tree",
          sha: packageTree.sha,
        }],
      }),
    });
    const commit = await githubApi<{ sha: string }>(config, "/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: input.message,
        tree: tree.sha,
        parents: [parentSha],
      }),
    });
    try {
      await githubApi(config, `/git/refs/heads/${config.branch}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      return commit.sha;
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 422 || attempt === 2) throw error;
    }
  }
  throw new Error("SDK mock Git update did not complete.");
}

export async function saveMockFilesToGit(input: {
  instanceId: string;
  gameId: string;
  files: unknown;
}) {
  return saveFilesToGit({
    instanceId: input.instanceId,
    gameId: input.gameId,
    files: prepareMockUploadFiles(input.files),
    prefix: `previews/${input.instanceId}/${input.gameId}/mock`,
    message: `Update SDK mock ${input.instanceId}/${input.gameId}`,
  });
}

export async function saveGamePackageFilesToGit(input: {
  instanceId: string;
  gameId: string;
  files: unknown;
}) {
  return saveFilesToGit({
    instanceId: input.instanceId,
    gameId: input.gameId,
    files: prepareGamePackageUploadFiles(input.files),
    prefix: `packages/${input.instanceId}/${input.gameId}/bundle`,
    message: `Update SDK game package ${input.instanceId}/${input.gameId}`,
  });
}
