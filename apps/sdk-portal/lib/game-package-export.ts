import { createHash } from "node:crypto";
import { resolveRuntimeExecutionArtifact, type RuntimeArtifactReader } from "@game-fields/sdk-runtime-artifact";
import { createStoredZip } from "./stored-zip.ts";

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp|github_pat|sk-[A-Za-z0-9])[_A-Za-z0-9-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\b(?:DATABASE_URL|REDIS_URL|SDK_MOCK_GITHUB_WRITE_TOKEN|CLIENT_SECRET|API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD)\s*[=:]\s*["']?[^\s"']{8,}/i,
];
const ALLOWED_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".mjs", ".json", ".txt", ".md", ".svg", ".png", ".jpg", ".jpeg",
  ".webp", ".gif", ".ico", ".woff", ".woff2", ".mp3", ".ogg", ".wav", ".ts", ".tsx",
]);

export type PackageExportMetadata = {
  creatorSlug: string;
  gameId: string;
  revision: string;
  createdAt: string;
  packageRootSha256: string | null;
  serverBundleSha256: string | null;
  appSetSourceSha256: string | null;
  sdkPackageVersion: string | null;
  sdkContractVersion: number | null;
};

function sha256(content: Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

export async function buildGamePackageExport(input: {
  metadata: PackageExportMetadata;
  reader: RuntimeArtifactReader;
  exportedAt?: string;
}) {
  const artifact = await resolveRuntimeExecutionArtifact({
    locator: { instanceId: input.metadata.creatorSlug, gameId: input.metadata.gameId, revision: input.metadata.revision },
    reader: input.reader,
    ...(input.metadata.serverBundleSha256 ? { expectedServerBundleSha256: input.metadata.serverBundleSha256 } : {}),
  });
  if (input.metadata.packageRootSha256 && artifact.packageRootSha256 !== input.metadata.packageRootSha256) {
    throw new Error("SDK_PACKAGE_EXPORT_ROOT_HASH_MISMATCH");
  }
  if (input.metadata.appSetSourceSha256 && artifact.appSetSourceSha256 !== input.metadata.appSetSourceSha256) {
    throw new Error("SDK_PACKAGE_EXPORT_APP_SET_HASH_MISMATCH");
  }
  for (const file of artifact.files) {
    const extension = file.path.slice(file.path.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error("SDK_PACKAGE_EXPORT_FILE_TYPE_FORBIDDEN");
    const text = new TextDecoder("utf-8", { fatal: false }).decode(file.content);
    if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) throw new Error("SDK_PACKAGE_EXPORT_SECRET_DETECTED");
  }
  const ordered = [...artifact.files].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const checksums = ordered.map((file) => `${sha256(file.content)}  package/${file.path}`).join("\n") + "\n";
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    origin: { platform: "game-fields", creatorSlug: input.metadata.creatorSlug, gameId: input.metadata.gameId, revision: input.metadata.revision, createdAt: input.metadata.createdAt, exportedAt },
    identity: { packageRootSha256: artifact.packageRootSha256, serverBundleSha256: artifact.serverBundleSha256, appSetSourceSha256: artifact.appSetSourceSha256 },
    contract: { sdkPackageVersion: input.metadata.sdkPackageVersion ?? artifact.sdkPackageVersion, sdkContractVersion: input.metadata.sdkContractVersion ?? artifact.sdkContractVersion, sourceCompleteness: "runtime-package" },
    files: { count: ordered.length, totalBytes: ordered.reduce((sum, file) => sum + file.content.byteLength, 0), checksumManifest: "checksums.sha256", excludedManifest: "excluded-files.json" },
    limitations: ["Complete editable client/server source graphs are not guaranteed.", "Tests, lockfiles, and deterministic build metadata may be absent."],
  } as const;
  const root = `${input.metadata.gameId}-game-fields-runtime-package`;
  const archive = createStoredZip([
    { name: `${root}/game-fields-export.json`, content: `${JSON.stringify(manifest, null, 2)}\n` },
    { name: `${root}/checksums.sha256`, content: checksums },
    { name: `${root}/excluded-files.json`, content: "[]\n" },
    ...ordered.map((file) => ({ name: `${root}/package/${file.path}`, content: file.content })),
  ]);
  return { archive, manifest, checksums };
}
