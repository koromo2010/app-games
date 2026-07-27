import { jsonValuesEqual } from "./canonical-json";
import { parseGameFieldsPackageManifest } from "./game-package-manifest";
import {
  gamePackageUploadFileFromBytes,
  prepareGamePackageUploadFiles,
  saveGamePackageFilesToGit,
  type GamePackageGitFile,
  type MockUploadFile,
} from "./mock-git-store";
import { sdkServiceHeaders } from "./sdk-service-auth";

const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_FILES = 128;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

export type DevelopmentArtifactSnapshot = {
  sourceCreatorSlug: string;
  sourceGameId: string;
  revision: string;
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
  manifest: unknown;
};

export class AppReleaseArtifactTransferError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: string;

  constructor(
    code: string,
    status: number,
    detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

type TransferDependencies = {
  fetchRuntime?: typeof fetch;
  saveFiles?: typeof saveGamePackageFilesToGit;
  serviceHeaders?: (method: string, url: string) => Record<string, string>;
  env?: NodeJS.ProcessEnv;
};

function developmentPortalBaseUrl(env: NodeJS.ProcessEnv) {
  return env.SDK_DEVELOPMENT_INTERNAL_URL?.replace(/\/$/, "")
    ?? "https://sdk-dev.game-fields.com";
}

function artifactEndpoint(
  snapshot: DevelopmentArtifactSnapshot,
  env: NodeJS.ProcessEnv,
) {
  return `${developmentPortalBaseUrl(env)}/api/internal/package-artifacts/${
    encodeURIComponent(snapshot.sourceCreatorSlug)
  }/${encodeURIComponent(snapshot.sourceGameId)}/${snapshot.revision}`;
}

export async function probeDevelopmentPackageArtifactSource(
  dependencies: Pick<TransferDependencies, "fetchRuntime" | "serviceHeaders" | "env"> = {},
) {
  const fetchRuntime = dependencies.fetchRuntime ?? fetch;
  const env = dependencies.env ?? process.env;
  const headers = dependencies.serviceHeaders
    ?? (
      fetchRuntime === fetch
        ? sdkServiceHeaders
        : () => ({})
    );
  const url = `${developmentPortalBaseUrl(env)}/api/internal/package-artifacts`;
  const response = await fetchRuntime(url, {
    headers: headers("GET", url),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  const payload = await response.json().catch(() => null) as {
    status?: unknown;
    channel?: unknown;
  } | null;
  if (
    !response.ok
    || payload?.status !== "ok"
    || payload.channel !== "development"
  ) {
    throw new AppReleaseArtifactTransferError(
      "APP_RELEASE_ARTIFACT_SOURCE_UNAVAILABLE",
      503,
      `SOURCE_HTTP_${response.status}`,
    );
  }
}

function validFileSummary(value: unknown): value is GamePackageGitFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<GamePackageGitFile>;
  return typeof file.path === "string"
    && file.path.length > 0
    && file.path.length <= 500
    && !file.path.startsWith("/")
    && !file.path.endsWith("/")
    && !file.path.split("/").some((part) => (
      !part || part === "." || part === ".." || part.length > 120
    ))
    && Number.isSafeInteger(file.bytes)
    && file.bytes! >= 0
    && file.bytes! <= MAX_FILE_BYTES;
}

function validateArtifactIndex(value: unknown, revision: string) {
  if (!value || typeof value !== "object") {
    throw new AppReleaseArtifactTransferError(
      "APP_RELEASE_ARTIFACT_INDEX_INVALID",
      502,
    );
  }
  const payload = value as { revision?: unknown; files?: unknown };
  if (
    payload.revision !== revision
    || !Array.isArray(payload.files)
    || payload.files.length === 0
    || payload.files.length > MAX_FILES
    || !payload.files.every(validFileSummary)
  ) {
    throw new AppReleaseArtifactTransferError(
      "APP_RELEASE_ARTIFACT_INDEX_INVALID",
      502,
    );
  }
  const files = payload.files as GamePackageGitFile[];
  if (
    new Set(files.map((file) => file.path)).size !== files.length
    || files.reduce((total, file) => total + file.bytes, 0) > MAX_TOTAL_BYTES
  ) {
    throw new AppReleaseArtifactTransferError(
      "APP_RELEASE_ARTIFACT_INDEX_INVALID",
      502,
    );
  }
  return files;
}

async function downloadFiles(input: {
  endpoint: string;
  files: readonly GamePackageGitFile[];
  fetchRuntime: typeof fetch;
  headers: (method: string, url: string) => Record<string, string>;
}) {
  const downloaded: MockUploadFile[] = [];
  for (let offset = 0; offset < input.files.length; offset += 8) {
    const batch = input.files.slice(offset, offset + 8);
    const items = await Promise.all(batch.map(async (file) => {
      const url = `${input.endpoint}?path=${encodeURIComponent(file.path)}`;
      const response = await input.fetchRuntime(url, {
        headers: input.headers("GET", url),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new AppReleaseArtifactTransferError(
          response.status === 404
            ? "APP_RELEASE_ARTIFACT_FILE_NOT_FOUND"
            : "APP_RELEASE_ARTIFACT_SOURCE_UNAVAILABLE",
          response.status === 404 ? 409 : 503,
          `SOURCE_HTTP_${response.status}`,
        );
      }
      const content = new Uint8Array(await response.arrayBuffer());
      if (content.byteLength !== file.bytes) {
        throw new AppReleaseArtifactTransferError(
          "APP_RELEASE_ARTIFACT_FILE_CHANGED",
          409,
        );
      }
      return gamePackageUploadFileFromBytes(file.path, content);
    }));
    downloaded.push(...items);
  }
  return downloaded;
}

export async function transferDevelopmentPackageArtifact(
  snapshot: DevelopmentArtifactSnapshot,
  dependencies: TransferDependencies = {},
) {
  if (
    !REVISION_PATTERN.test(snapshot.revision)
    || !SHA256_PATTERN.test(snapshot.packageRootSha256)
    || !SHA256_PATTERN.test(snapshot.serverBundleSha256)
    || !SHA256_PATTERN.test(snapshot.appSetSourceSha256)
  ) {
    throw new AppReleaseArtifactTransferError(
      "APP_RELEASE_ARTIFACT_SOURCE_INVALID",
      400,
    );
  }
  const fetchRuntime = dependencies.fetchRuntime ?? fetch;
  const saveFiles = dependencies.saveFiles ?? saveGamePackageFilesToGit;
  const env = dependencies.env ?? process.env;
  const headers = dependencies.serviceHeaders
    ?? (
      fetchRuntime === fetch
        ? sdkServiceHeaders
        : () => ({})
    );
  const endpoint = artifactEndpoint(snapshot, env);
  const indexResponse = await fetchRuntime(endpoint, {
    headers: headers("GET", endpoint),
    cache: "no-store",
  });
  if (!indexResponse.ok) {
    throw new AppReleaseArtifactTransferError(
      indexResponse.status === 404
        ? "APP_RELEASE_ARTIFACT_SOURCE_NOT_FOUND"
        : "APP_RELEASE_ARTIFACT_SOURCE_UNAVAILABLE",
      indexResponse.status === 404 ? 409 : 503,
      `SOURCE_HTTP_${indexResponse.status}`,
    );
  }
  const files = validateArtifactIndex(
    await indexResponse.json().catch(() => null),
    snapshot.revision,
  );
  const downloaded = await downloadFiles({
    endpoint,
    files,
    fetchRuntime,
    headers,
  });
  let prepared;
  let parsed;
  try {
    prepared = prepareGamePackageUploadFiles(downloaded);
    parsed = parseGameFieldsPackageManifest({
      gameId: snapshot.sourceGameId,
      files: prepared,
    });
  } catch {
    throw new AppReleaseArtifactTransferError(
      "APP_RELEASE_ARTIFACT_PACKAGE_INVALID",
      422,
    );
  }
  if (
    parsed.packageRootSha256 !== snapshot.packageRootSha256
    || parsed.bundleSha256 !== snapshot.serverBundleSha256
    || parsed.appSetSourceSha256 !== snapshot.appSetSourceSha256
    || !jsonValuesEqual(parsed.manifest.manifest, snapshot.manifest)
  ) {
    throw new AppReleaseArtifactTransferError(
      "APP_RELEASE_ARTIFACT_HASH_MISMATCH",
      422,
    );
  }
  let revision: string;
  try {
    revision = await saveFiles({
      instanceId: snapshot.sourceCreatorSlug,
      gameId: snapshot.sourceGameId,
      files: prepared,
    });
  } catch {
    throw new AppReleaseArtifactTransferError(
      "APP_RELEASE_ARTIFACT_TARGET_WRITE_FAILED",
      503,
    );
  }
  if (!REVISION_PATTERN.test(revision)) {
    throw new AppReleaseArtifactTransferError(
      "APP_RELEASE_ARTIFACT_TARGET_REVISION_INVALID",
      503,
    );
  }
  return {
    sourceRevision: snapshot.revision,
    revision,
    packageRootSha256: parsed.packageRootSha256,
    serverBundleSha256: parsed.bundleSha256,
    appSetSourceSha256: parsed.appSetSourceSha256,
    manifest: parsed.manifest.manifest,
  };
}
