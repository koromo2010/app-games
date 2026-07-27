const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const INSTANCE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;
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
const TEXT_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".mjs", ".json", ".txt", ".svg", ".ts", ".tsx",
]);

export type MockUploadFile = {
  path: string;
  content: string;
  encoding?: "utf-8" | "base64";
};

export type PreparedUploadFile = Required<MockUploadFile> & { bytes: number };
type MockUploadFileMap = Record<string, string>;

export type GamePackageGitFile = {
  path: string;
  bytes: number;
};

class GitHubApiError extends Error {
  readonly status: number;
  readonly operation: string;

  constructor(status: number, operation: string) {
    super("SDK mock Git request failed.");
    this.status = status;
    this.operation = operation;
  }
}

export class GamePackageGitTargetError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function mockGitConfig(env: NodeJS.ProcessEnv = process.env) {
  const repository = env.SDK_MOCK_GITHUB_REPOSITORY ?? "";
  const branch = env.SDK_MOCK_GITHUB_BRANCH?.trim() || "sdk-previews";
  const token = env.SDK_MOCK_GITHUB_WRITE_TOKEN ?? "";
  const missing = [
    !REPOSITORY_PATTERN.test(repository) ? "SDK_MOCK_GITHUB_REPOSITORY" : "",
    !BRANCH_PATTERN.test(branch) ? "SDK_MOCK_GITHUB_BRANCH" : "",
    !token ? "SDK_MOCK_GITHUB_WRITE_TOKEN" : "",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new GamePackageGitTargetError(
      `SDK_PACKAGE_GIT_CONFIG_INVALID_${missing.join("_AND_")}`,
    );
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

function hasBinarySignature(extension: string, bytes: Buffer) {
  if (extension === ".png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  }
  if (extension === ".gif") {
    return bytes.subarray(0, 6).toString("ascii") === "GIF87a"
      || bytes.subarray(0, 6).toString("ascii") === "GIF89a";
  }
  if (extension === ".webp") {
    return bytes.subarray(0, 4).toString("ascii") === "RIFF"
      && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (extension === ".woff") return bytes.subarray(0, 4).toString("ascii") === "wOFF";
  if (extension === ".woff2") return bytes.subarray(0, 4).toString("ascii") === "wOF2";
  if (extension === ".ogg") return bytes.subarray(0, 4).toString("ascii") === "OggS";
  if (extension === ".wav") {
    return bytes.subarray(0, 4).toString("ascii") === "RIFF"
      && bytes.subarray(8, 12).toString("ascii") === "WAVE";
  }
  if (extension === ".ico") {
    return bytes.length >= 6
      && bytes[0] === 0
      && bytes[1] === 0
      && bytes[2] === 1
      && bytes[3] === 0;
  }
  if (extension === ".mp3") {
    return bytes.subarray(0, 3).toString("ascii") === "ID3"
      || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  return true;
}

function inspectUploadContent(
  path: string,
  extension: string,
  content: string,
  encoding: "utf-8" | "base64",
) {
  const bytes = encoding === "base64"
    ? Buffer.from(content, "base64")
    : Buffer.from(content, "utf8");
  if (TEXT_EXTENSIONS.has(extension)) {
    if (encoding !== "utf-8" || content.includes("\0")) {
      throw new Error(`SDK_UPLOAD_TEXT_ENCODING_INVALID:${path}`);
    }
    if (
      extension === ".svg"
      && (
        /<\s*(?:script|foreignObject|iframe|object|embed)\b/i.test(content)
        || /\b(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:text\/html)/i.test(content)
      )
    ) {
      throw new Error(`SDK_UPLOAD_SVG_ACTIVE_CONTENT_FORBIDDEN:${path}`);
    }
    if (
      extension === ".html"
      && (
        /<\s*(?:iframe|object|embed)\b/i.test(content)
        || /<\s*meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh\b/i.test(content)
        || /<\s*base\b[^>]*href\s*=\s*["']?\s*(?:https?:|\/\/)/i.test(content)
      )
    ) {
      throw new Error(`SDK_UPLOAD_HTML_EMBED_FORBIDDEN:${path}`);
    }
    return;
  }
  if (!hasBinarySignature(extension, bytes)) {
    throw new Error(`SDK_UPLOAD_MIME_MISMATCH:${path}`);
  }
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
    const extension = fileExtension(path);
    if (!safeRelativePath(path) || !extension || seen.has(path)) throw new Error("Mock upload path is invalid.");
    if (encoding !== "utf-8" && encoding !== "base64") throw new Error("Mock upload encoding is invalid.");
    if (encoding === "base64" && (content.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content))) {
      throw new Error("Mock upload base64 content is invalid.");
    }
    const bytes = encoding === "base64" ? Buffer.from(content, "base64").byteLength : Buffer.byteLength(content, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new Error("Mock upload file is too large.");
    inspectUploadContent(path, extension, content, encoding);
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

function githubOperation(path: string, method: string) {
  if (!path) return "repository";
  if (path.startsWith("/git/ref/heads/")) return method === "PATCH" ? "update-ref" : "read-ref";
  if (path.startsWith("/git/refs/heads/")) return method === "PATCH" ? "update-ref" : "read-ref";
  if (path === "/git/refs") return "create-ref";
  if (path.startsWith("/git/commits/")) return "read-commit";
  if (path === "/git/commits") return "create-commit";
  if (path === "/git/blobs") return "create-blob";
  if (path.startsWith("/git/trees/")) return "read-tree";
  if (path === "/git/trees") return "create-tree";
  if (path === "/contents/.game-fields-storage" && method === "PUT") {
    return "initialize-repository";
  }
  if (path.startsWith("/contents/")) return "read-content";
  return `${method.toLowerCase()}-request`;
}

async function githubApi<T>(
  config: ReturnType<typeof mockGitConfig>,
  path: string,
  init?: RequestInit,
  fetchRuntime: typeof fetch = fetch,
) {
  const method = init?.method ?? "GET";
  const response = await fetchRuntime(`https://api.github.com/repos/${config.repository}${path}`, {
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
  if (!response.ok) {
    throw new GitHubApiError(response.status, githubOperation(path, method));
  }
  return response.json() as Promise<T>;
}

function packageGitTargetCode(error: unknown) {
  if (error instanceof GamePackageGitTargetError) return error.code;
  if (!(error instanceof GitHubApiError)) return "SDK_PACKAGE_GIT_WRITE_FAILED";
  const reason = error.status === 401
    ? "AUTH_INVALID"
    : error.status === 403
      ? "WRITE_FORBIDDEN"
      : error.status === 404
        ? "REPOSITORY_NOT_ACCESSIBLE"
        : error.status === 409 && error.operation === "read-ref"
          ? "REPOSITORY_EMPTY"
        : error.status === 429
          ? "RATE_LIMITED"
          : `HTTP_${error.status}`;
  return `SDK_PACKAGE_GIT_${reason}_${error.operation.toUpperCase().replaceAll("-", "_")}`;
}

export function gamePackageGitWriteFailureDiagnostic(error: unknown) {
  return {
    code: packageGitTargetCode(error),
    status: error instanceof GitHubApiError ? error.status : null,
    operation: error instanceof GitHubApiError ? error.operation : null,
  };
}

export async function probeGamePackageGitWriteTarget(
  dependencies: {
    fetchRuntime?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const config = mockGitConfig(dependencies.env);
  try {
    const repository = await githubApi<{
      default_branch?: unknown;
      full_name?: unknown;
      permissions?: { push?: unknown };
    }>(
      config,
      "",
      undefined,
      dependencies.fetchRuntime ?? fetch,
    );
    if (
      repository.full_name !== config.repository
      || repository.permissions?.push !== true
    ) {
      throw new GamePackageGitTargetError(
        "SDK_PACKAGE_GIT_WRITE_PERMISSION_MISSING",
      );
    }
    const defaultBranch = typeof repository.default_branch === "string"
      && BRANCH_PATTERN.test(repository.default_branch)
      ? repository.default_branch
      : "main";
    try {
      await githubApi(
        config,
        `/git/ref/heads/${config.branch}`,
        undefined,
        dependencies.fetchRuntime ?? fetch,
      );
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
      await githubApi(
        config,
        `/git/ref/heads/${defaultBranch}`,
        undefined,
        dependencies.fetchRuntime ?? fetch,
      );
    }
  } catch (error) {
    if (error instanceof GamePackageGitTargetError) throw error;
    throw new GamePackageGitTargetError(packageGitTargetCode(error));
  }
}

function assertGamePackageGitScope(input: {
  instanceId: string;
  gameId: string;
  revision: string;
}) {
  if (
    !INSTANCE_PATTERN.test(input.instanceId)
    || !GAME_PATTERN.test(input.gameId)
    || !REVISION_PATTERN.test(input.revision)
  ) {
    throw new Error("SDK game package Git scope is invalid.");
  }
}

export async function listGamePackageFilesAtRevision(input: {
  instanceId: string;
  gameId: string;
  revision: string;
}): Promise<GamePackageGitFile[]> {
  assertGamePackageGitScope(input);
  const config = mockGitConfig();
  const commit = await githubApi<{ tree: { sha: string } }>(
    config,
    `/git/commits/${input.revision}`,
  );
  const tree = await githubApi<{
    truncated?: boolean;
    tree?: Array<{
      path?: string;
      mode?: string;
      type?: string;
      size?: number;
    }>;
  }>(config, `/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated || !Array.isArray(tree.tree)) {
    throw new Error("SDK game package Git tree is unavailable.");
  }
  const prefix = `packages/${input.instanceId}/${input.gameId}/bundle/`;
  const files = tree.tree
    .filter((entry) => entry.type === "blob" && entry.path?.startsWith(prefix))
    .map((entry): GamePackageGitFile => ({
      path: entry.path!.slice(prefix.length),
      bytes: Number(entry.size),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (
    files.length === 0
    || files.length > 128
    || files.some((file) => (
      !safeRelativePath(file.path)
      || !fileExtension(file.path)
      || !Number.isSafeInteger(file.bytes)
      || file.bytes < 0
      || file.bytes > MAX_FILE_BYTES
    ))
    || new Set(files.map((file) => file.path)).size !== files.length
    || files.reduce((total, file) => total + file.bytes, 0) > MAX_TOTAL_BYTES
  ) {
    throw new Error("SDK game package Git tree is invalid.");
  }
  for (const required of REQUIRED_PACKAGE_FILES) {
    if (!files.some((file) => file.path === required)) {
      throw new Error(`Game package upload is missing ${required}.`);
    }
  }
  return files;
}

export async function readGamePackageFileAtRevision(input: {
  instanceId: string;
  gameId: string;
  revision: string;
  path: string;
}) {
  assertGamePackageGitScope(input);
  if (!safeRelativePath(input.path) || !fileExtension(input.path)) {
    throw new Error("SDK game package Git path is invalid.");
  }
  const config = mockGitConfig();
  const repositoryPath = `packages/${input.instanceId}/${input.gameId}/bundle/${input.path}`;
  const encodedPath = repositoryPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `https://api.github.com/repos/${config.repository}/contents/${encodedPath}?ref=${input.revision}`,
    {
      headers: {
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "game-fields-sdk-portal",
      },
      cache: "no-store",
      redirect: "error",
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new GitHubApiError(response.status, "read-content");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FILE_BYTES) {
    throw new Error("SDK game package Git file is too large.");
  }
  const content = Buffer.from(await response.arrayBuffer());
  if (content.byteLength > MAX_FILE_BYTES) {
    throw new Error("SDK game package Git file is too large.");
  }
  return content;
}

export function gamePackageUploadFileFromBytes(
  path: string,
  content: Uint8Array,
): MockUploadFile {
  const extension = fileExtension(path);
  if (!safeRelativePath(path) || !extension) {
    throw new Error("SDK game package Git path is invalid.");
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return {
      path,
      content: new TextDecoder("utf-8", { fatal: true }).decode(content),
      encoding: "utf-8",
    };
  }
  return {
    path,
    content: Buffer.from(content).toString("base64"),
    encoding: "base64",
  };
}

async function initializeEmptyRepository(
  config: ReturnType<typeof mockGitConfig>,
  defaultBranch: string,
  fetchRuntime: typeof fetch,
) {
  try {
    const initialized = await githubApi<{ commit: { sha: string } }>(
      config,
      "/contents/.game-fields-storage",
      {
        method: "PUT",
        body: JSON.stringify({
          message: "Initialize Game Fields SDK package storage",
          content: Buffer.from(
            "Game Fields SDK package storage. Managed automatically.\n",
            "utf8",
          ).toString("base64"),
          branch: defaultBranch,
        }),
      },
      fetchRuntime,
    );
    return initialized.commit.sha;
  } catch (error) {
    if (
      !(error instanceof GitHubApiError)
      || (error.status !== 409 && error.status !== 422)
    ) {
      throw error;
    }
    const ref = await githubApi<{ object: { sha: string } }>(
      config,
      `/git/ref/heads/${defaultBranch}`,
      undefined,
      fetchRuntime,
    );
    return ref.object.sha;
  }
}

async function ensureBranch(
  config: ReturnType<typeof mockGitConfig>,
  fetchRuntime: typeof fetch,
) {
  try {
    const ref = await githubApi<{ object: { sha: string } }>(
      config,
      `/git/ref/heads/${config.branch}`,
      undefined,
      fetchRuntime,
    );
    return ref.object.sha;
  } catch (error) {
    if (
      !(error instanceof GitHubApiError)
      || (error.status !== 404 && error.status !== 409)
    ) {
      throw error;
    }
  }
  const repository = await githubApi<{ default_branch: string }>(
    config,
    "",
    undefined,
    fetchRuntime,
  );
  let baseSha: string;
  try {
    const base = await githubApi<{ object: { sha: string } }>(
      config,
      `/git/ref/heads/${repository.default_branch}`,
      undefined,
      fetchRuntime,
    );
    baseSha = base.object.sha;
  } catch (error) {
    if (
      !(error instanceof GitHubApiError)
      || (error.status !== 404 && error.status !== 409)
    ) {
      throw error;
    }
    baseSha = await initializeEmptyRepository(
      config,
      repository.default_branch,
      fetchRuntime,
    );
  }
  if (config.branch === repository.default_branch) return baseSha;
  try {
    await githubApi(config, "/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${config.branch}`, sha: baseSha }),
    }, fetchRuntime);
    return baseSha;
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
    const ref = await githubApi<{ object: { sha: string } }>(
      config,
      `/git/ref/heads/${config.branch}`,
      undefined,
      fetchRuntime,
    );
    return ref.object.sha;
  }
}

async function saveFilesToGit(input: {
  instanceId: string;
  gameId: string;
  files: readonly PreparedUploadFile[];
  prefix: string;
  message: string;
  env?: NodeJS.ProcessEnv;
  fetchRuntime?: typeof fetch;
}) {
  if (!INSTANCE_PATTERN.test(input.instanceId) || !GAME_PATTERN.test(input.gameId)) {
    throw new Error("SDK mock storage scope is invalid.");
  }
  const config = mockGitConfig(input.env);
  const fetchRuntime = input.fetchRuntime ?? fetch;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parentSha = await ensureBranch(config, fetchRuntime);
    const parent = await githubApi<{ tree: { sha: string } }>(
      config,
      `/git/commits/${parentSha}`,
      undefined,
      fetchRuntime,
    );
    const blobs = await Promise.all(input.files.map((file) => githubApi<{ sha: string }>(config, "/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding: file.encoding }),
    }, fetchRuntime)));
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
    }, fetchRuntime);
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
    }, fetchRuntime);
    const commit = await githubApi<{ sha: string }>(config, "/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: input.message,
        tree: tree.sha,
        parents: [parentSha],
      }),
    }, fetchRuntime);
    try {
      await githubApi(config, `/git/refs/heads/${config.branch}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      }, fetchRuntime);
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
}, dependencies: {
  env?: NodeJS.ProcessEnv;
  fetchRuntime?: typeof fetch;
} = {}) {
  return saveFilesToGit({
    instanceId: input.instanceId,
    gameId: input.gameId,
    files: prepareMockUploadFiles(input.files),
    prefix: `previews/${input.instanceId}/${input.gameId}/mock`,
    message: `Update SDK mock ${input.instanceId}/${input.gameId}`,
    ...dependencies,
  });
}

export async function saveGamePackageFilesToGit(input: {
  instanceId: string;
  gameId: string;
  files: unknown;
}, dependencies: {
  env?: NodeJS.ProcessEnv;
  fetchRuntime?: typeof fetch;
} = {}) {
  return saveFilesToGit({
    instanceId: input.instanceId,
    gameId: input.gameId,
    files: prepareGamePackageUploadFiles(input.files),
    prefix: `packages/${input.instanceId}/${input.gameId}/bundle`,
    message: `Update SDK game package ${input.instanceId}/${input.gameId}`,
    ...dependencies,
  });
}
