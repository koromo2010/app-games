const defaultRepository = "koromo2010/app-games";
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const shaPattern = /^[a-f0-9]{40}$/;

type Fetch = typeof fetch;

type GitHubComparePayload = {
  status?: unknown;
  ahead_by?: unknown;
  behind_by?: unknown;
  total_commits?: unknown;
  html_url?: unknown;
  base_commit?: { sha?: unknown; html_url?: unknown };
  merge_base_commit?: { sha?: unknown };
  commits?: Array<{ sha?: unknown; html_url?: unknown }>;
};

type GitHubRefPayload = {
  object?: { sha?: unknown };
};

export type DevMainReleaseStatus = {
  repository: string;
  mainSha: string;
  developSha: string;
  compareStatus: "ahead" | "behind" | "diverged" | "identical";
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
  compareUrl: string;
  canPromote: boolean;
  writeConfigured: boolean;
};

export class GitHubReleaseError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function releaseRepository(env: NodeJS.ProcessEnv) {
  const repository = env.GAME_FIELDS_GITHUB_REPOSITORY?.trim()
    || defaultRepository;
  if (!repositoryPattern.test(repository)) {
    throw new GitHubReleaseError("GITHUB_RELEASE_REPOSITORY_INVALID", 503);
  }
  return repository;
}

function releaseToken(env: NodeJS.ProcessEnv) {
  return env.GAME_FIELDS_GITHUB_RELEASE_TOKEN?.trim() || "";
}

function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "game-fields-admin-release",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubJson(
  path: string,
  input: RequestInit,
  token: string,
  fetchImpl: Fetch,
) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    ...input,
    headers: {
      ...githubHeaders(token),
      ...input.headers,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GitHubReleaseError(
      response.status === 401 || response.status === 403
        ? "GITHUB_RELEASE_AUTH_FAILED"
        : response.status === 404
          ? "GITHUB_RELEASE_REPOSITORY_NOT_FOUND"
          : "GITHUB_RELEASE_REQUEST_FAILED",
      response.status,
    );
  }
  return payload;
}

function validCompareStatus(
  value: unknown,
): value is DevMainReleaseStatus["compareStatus"] {
  return value === "ahead"
    || value === "behind"
    || value === "diverged"
    || value === "identical";
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    ? value
    : null;
}

export async function loadDevMainReleaseStatus(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: Fetch = fetch,
): Promise<DevMainReleaseStatus> {
  const repository = releaseRepository(env);
  const token = releaseToken(env);
  const [payload, mainRef, developRef] = await Promise.all([
    githubJson(
      `/repos/${repository}/compare/main...develop`,
      { method: "GET" },
      token,
      fetchImpl,
    ) as Promise<GitHubComparePayload>,
    githubJson(
      `/repos/${repository}/git/ref/heads/main`,
      { method: "GET" },
      token,
      fetchImpl,
    ) as Promise<GitHubRefPayload>,
    githubJson(
      `/repos/${repository}/git/ref/heads/develop`,
      { method: "GET" },
      token,
      fetchImpl,
    ) as Promise<GitHubRefPayload>,
  ]);
  const compareStatus = payload.status;
  const mainSha = mainRef.object?.sha;
  const developSha = developRef.object?.sha;
  const aheadBy = nonNegativeInteger(payload.ahead_by);
  const behindBy = nonNegativeInteger(payload.behind_by);
  const totalCommits = nonNegativeInteger(payload.total_commits);
  if (
    !validCompareStatus(compareStatus)
    || typeof mainSha !== "string"
    || !shaPattern.test(mainSha)
    || typeof developSha !== "string"
    || !shaPattern.test(developSha)
    || aheadBy === null
    || behindBy === null
    || totalCommits === null
    || typeof payload.html_url !== "string"
  ) {
    throw new GitHubReleaseError("GITHUB_RELEASE_RESPONSE_INVALID", 502);
  }
  return {
    repository,
    mainSha,
    developSha,
    compareStatus,
    aheadBy,
    behindBy,
    totalCommits,
    compareUrl: payload.html_url,
    canPromote: compareStatus === "ahead" && aheadBy > 0 && behindBy === 0,
    writeConfigured: Boolean(token),
  };
}

export async function promoteDevelopToMain(
  input: {
    expectedMainSha: string;
    expectedDevelopSha: string;
  },
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: Fetch = fetch,
) {
  const token = releaseToken(env);
  if (!token) {
    throw new GitHubReleaseError("GITHUB_RELEASE_TOKEN_NOT_CONFIGURED", 503);
  }
  if (
    !shaPattern.test(input.expectedMainSha)
    || !shaPattern.test(input.expectedDevelopSha)
  ) {
    throw new GitHubReleaseError("GITHUB_RELEASE_INPUT_INVALID", 400);
  }
  const status = await loadDevMainReleaseStatus(env, fetchImpl);
  if (
    status.mainSha !== input.expectedMainSha
    || status.developSha !== input.expectedDevelopSha
  ) {
    throw new GitHubReleaseError("GITHUB_RELEASE_SOURCE_CHANGED", 409);
  }
  if (!status.canPromote) {
    throw new GitHubReleaseError("GITHUB_RELEASE_NOT_FAST_FORWARD", 409);
  }
  const payload = await githubJson(
    `/repos/${status.repository}/git/refs/heads/main`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sha: status.developSha,
        force: false,
      }),
    },
    token,
    fetchImpl,
  ) as GitHubRefPayload;
  const promotedSha = payload.object?.sha;
  if (promotedSha !== status.developSha) {
    throw new GitHubReleaseError("GITHUB_RELEASE_UPDATE_INVALID", 502);
  }
  return {
    promoted: true as const,
    repository: status.repository,
    from: "develop" as const,
    to: "main" as const,
    previousMainSha: status.mainSha,
    mainSha: promotedSha,
  };
}
