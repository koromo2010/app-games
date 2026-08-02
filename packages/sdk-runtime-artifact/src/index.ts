import { createHash } from "node:crypto";

const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const REVISION = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_FILES = 128;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_SERVER_BYTES = 1024 * 1024;
const TEXT_EXTENSIONS = [
  ".html", ".css", ".js", ".mjs", ".json", ".txt", ".md", ".svg",
  ".ts", ".tsx",
];

export type RuntimeArtifactLocator = {
  instanceId: string;
  gameId: string;
  revision: string;
};

export type RuntimeArtifactTreeEntry = {
  path: string;
  type: "blob" | "tree";
  sha: string;
  bytes?: number;
};

export type RuntimeArtifactReader = {
  readCommit(revision: string): Promise<{ commitSha: string; treeSha: string } | null>;
  readTree(treeSha: string): Promise<readonly RuntimeArtifactTreeEntry[] | null>;
  readBlob(blobSha: string): Promise<Uint8Array | null>;
};

export type RuntimePackageFile = {
  path: string;
  content: Uint8Array;
};

export class RuntimeArtifactError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`SDK_RUNTIME_ARTIFACT_${code}`);
    this.name = "RuntimeArtifactError";
    this.code = code;
  }
}

function fail(code: string): never {
  throw new RuntimeArtifactError(code);
}

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function runtimeManifestSha256(value: unknown) {
  return sha256(canonicalJson(value));
}

function safeRelativePath(path: string) {
  if (!path || path.length > 500 || path.startsWith("/") || path.endsWith("/")) return false;
  const parts = path.split("/");
  return parts.length <= 20
    && parts.every((part) => part && part !== "." && part !== ".." && part.length <= 120);
}

function isText(path: string) {
  const lower = path.toLowerCase();
  return TEXT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function normalizedPackageContent(file: RuntimePackageFile) {
  if (!isText(file.path)) return Buffer.from(file.content);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(file.content).replace(/\r\n?/g, "\n");
  } catch {
    fail("TEXT_INVALID");
  }
  if (!file.path.toLowerCase().endsWith(".json")) return Buffer.from(text, "utf8");
  try {
    return Buffer.from(`${canonicalJson(JSON.parse(text) as unknown)}\n`, "utf8");
  } catch {
    fail("MANIFEST_INVALID");
  }
}

export function gameFieldsPackageRootSha256(files: readonly RuntimePackageFile[]) {
  const hash = createHash("sha256");
  const ordered = [...files].sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  for (const file of ordered) {
    const content = normalizedPackageContent(file);
    hash.update(Buffer.from(file.path, "utf8"));
    hash.update("\0");
    hash.update(createHash("sha256").update(content).digest());
    hash.update("\0");
  }
  return hash.digest("hex");
}

type PackageManifest = {
  schemaVersion: 1;
  gameId: string;
  sdkPackageVersion: string;
  sdkContractVersion: number;
  manifest: Record<string, unknown> & { sdkVersion: number; id: string };
  /** Browser asset graph root. */
  client: { entry: string };
  server: {
    /** Server runtime entry; it is not part of the browser asset graph. */
    entry: "server.bundle.js";
    bundleSha256: string;
    /** Server source graph root; it is audited separately from browser assets. */
    appSetSource: "source/app-set.ts";
    appSetSourceSha256: string;
  };
};

function parsePackageManifest(gameId: string, files: ReadonlyMap<string, Uint8Array>) {
  const raw = files.get("game-fields-package.json");
  if (!raw) fail("PATH_NOT_FOUND");
  let candidate: Partial<PackageManifest>;
  try {
    candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) as Partial<PackageManifest>;
  } catch {
    fail("MANIFEST_INVALID");
  }
  const clientEntry = candidate.client?.entry;
  if (
    candidate.schemaVersion !== 1
    || candidate.gameId !== gameId
    || typeof candidate.sdkPackageVersion !== "string"
    || !candidate.sdkPackageVersion.trim()
    || !Number.isSafeInteger(candidate.sdkContractVersion)
    || Number(candidate.sdkContractVersion) < 1
    || !candidate.manifest
    || candidate.manifest.id !== gameId
    || !Number.isSafeInteger(candidate.manifest.sdkVersion)
    || typeof clientEntry !== "string"
    || !safeRelativePath(clientEntry)
    || clientEntry.startsWith("source/")
    || !clientEntry.toLowerCase().endsWith(".html")
    || !files.has(clientEntry)
    || candidate.server?.entry !== "server.bundle.js"
    || candidate.server.appSetSource !== "source/app-set.ts"
    || !SHA256.test(candidate.server.bundleSha256 ?? "")
    || !SHA256.test(candidate.server.appSetSourceSha256 ?? "")
  ) fail("MANIFEST_INVALID");
  return candidate as PackageManifest;
}

function validateLocator(locator: RuntimeArtifactLocator) {
  if (!ID.test(locator.instanceId) || !ID.test(locator.gameId)) fail("LOCATOR_INVALID");
  if (!REVISION.test(locator.revision)) fail("REVISION_INVALID");
}

export async function resolveRuntimeExecutionArtifact(input: {
  locator: RuntimeArtifactLocator;
  reader: RuntimeArtifactReader;
  expectedServerBundleSha256?: string;
}) {
  validateLocator(input.locator);
  const commit = await input.reader.readCommit(input.locator.revision);
  if (!commit) fail("COMMIT_NOT_FOUND");
  if (commit.commitSha !== input.locator.revision) fail("COMMIT_MISMATCH");
  const tree = await input.reader.readTree(commit.treeSha);
  if (!tree) fail("TREE_NOT_FOUND");
  const prefix = `packages/${input.locator.instanceId}/${input.locator.gameId}/bundle/`;
  const entries = tree.filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix));
  if (entries.length === 0 || entries.length > MAX_FILES) fail("TREE_INVALID");
  const paths = entries.map((entry) => entry.path.slice(prefix.length));
  if (
    new Set(paths).size !== paths.length
    || paths.some((path) => !safeRelativePath(path))
    || entries.some((entry) => entry.bytes !== undefined && (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > MAX_FILE_BYTES))
  ) fail("TREE_INVALID");
  for (const required of ["game-fields-package.json", "server.bundle.js", "source/app-set.ts"]) {
    if (!paths.includes(required)) fail("PATH_NOT_FOUND");
  }
  const files: RuntimePackageFile[] = [];
  let totalBytes = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const content = await input.reader.readBlob(entries[index]!.sha);
    if (!content) fail("BLOB_NOT_FOUND");
    if (content.byteLength > MAX_FILE_BYTES) fail("FILE_TOO_LARGE");
    totalBytes += content.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) fail("PACKAGE_TOO_LARGE");
    files.push({ path: paths[index]!, content });
  }
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const packageManifest = parsePackageManifest(input.locator.gameId, byPath);
  const serverBundle = byPath.get("server.bundle.js")!;
  const appSetSource = byPath.get("source/app-set.ts")!;
  if (serverBundle.byteLength > MAX_SERVER_BYTES) fail("SERVER_BUNDLE_TOO_LARGE");
  const serverBundleSha256 = sha256(serverBundle);
  const appSetSourceSha256 = sha256(appSetSource);
  if (serverBundleSha256 !== packageManifest.server.bundleSha256) fail("SERVER_BUNDLE_HASH_MISMATCH");
  if (appSetSourceSha256 !== packageManifest.server.appSetSourceSha256) fail("APP_SET_HASH_MISMATCH");
  if (input.expectedServerBundleSha256 && serverBundleSha256 !== input.expectedServerBundleSha256) {
    fail("SERVER_BUNDLE_HASH_MISMATCH");
  }
  return {
    requestedRevision: input.locator.revision,
    resolvedArtifactCommit: commit.commitSha,
    packageRootSha256: gameFieldsPackageRootSha256(files),
    serverBundleSha256,
    appSetSourceSha256,
    manifestSha256: runtimeManifestSha256(packageManifest.manifest),
    manifestVersion: packageManifest.manifest.sdkVersion,
    manifest: packageManifest.manifest,
    sdkPackageVersion: packageManifest.sdkPackageVersion,
    sdkContractVersion: packageManifest.sdkContractVersion,
    serverBundle,
    files,
  };
}
