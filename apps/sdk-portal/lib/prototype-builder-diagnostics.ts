import { createHash } from "node:crypto";

export const PROTOTYPE_BUILDER_RUNTIME_CONTRACT_VERSION = 1 as const;

export type PrototypeBuildStage =
  | "input-validation"
  | "mock-validation"
  | "dependency-resolution"
  | "server-bundle"
  | "formal-client-bundle"
  | "prototype-bundle"
  | "output-validation";

export type PrototypeBuildFailureCode =
  | "MANIFEST_INVALID"
  | "MANIFEST_ID_MISMATCH"
  | "REQUIRED_SOURCE_MISSING"
  | "SOURCE_TOO_LARGE"
  | "MOCK_QUALITY_INVALID"
  | "IMPORT_FORBIDDEN"
  | "SOURCE_NOT_FOUND"
  | "DEPENDENCY_UNAVAILABLE"
  | "ESBUILD_UNAVAILABLE"
  | "ESBUILD_COMPILE_FAILED"
  | "BUNDLE_EMPTY"
  | "BUNDLE_TOO_LARGE";

export type PrototypeBuildDependencyClass =
  | "none"
  | "game-sdk"
  | "react"
  | "react-dom"
  | "esbuild"
  | "unknown";

export class PrototypeBuildError extends Error {
  readonly code: PrototypeBuildFailureCode;
  readonly stage: PrototypeBuildStage;
  readonly dependencyClass: PrototypeBuildDependencyClass;

  constructor(input: {
    code: PrototypeBuildFailureCode;
    stage: PrototypeBuildStage;
    dependencyClass?: PrototypeBuildDependencyClass;
  }) {
    super(`PROTOTYPE_BUILD_${input.code}`);
    this.name = "PrototypeBuildError";
    this.code = input.code;
    this.stage = input.stage;
    this.dependencyClass = input.dependencyClass ?? "none";
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export type PrototypeBuildInputFingerprint = {
  schemaVersion: 1;
  manifestSha256: string;
  filePathSetSha256: string;
  fileContentMapSha256: string;
  sourcePathSetSha256: string;
  sourceContentMapSha256: string;
  moduleUsageSha256: string;
  moduleBindingSha256: string;
  fileCount: number;
  sourceFileCount: number;
  totalUtf8BytesBucket: "0-64KiB" | "64-256KiB" | "256KiB-1MiB" | "1MiB+";
};

function totalByteBucket(totalBytes: number): PrototypeBuildInputFingerprint["totalUtf8BytesBucket"] {
  if (totalBytes < 64 * 1024) return "0-64KiB";
  if (totalBytes < 256 * 1024) return "64-256KiB";
  if (totalBytes < 1024 * 1024) return "256KiB-1MiB";
  return "1MiB+";
}

export function createPrototypeBuildInputFingerprint(input: {
  manifest: unknown;
  files: Readonly<Record<string, string>>;
  moduleUsage: unknown;
  moduleBinding: unknown;
}): PrototypeBuildInputFingerprint {
  const paths = Object.keys(input.files).sort();
  const sourcePaths = paths.filter((file) => file.startsWith("source/"));
  const contentMap = paths.map((file) => [file, sha256(input.files[file] ?? "")]);
  const sourceContentMap = contentMap.filter(([file]) => file.startsWith("source/"));
  const totalBytes = paths.reduce(
    (total, file) => total + Buffer.byteLength(input.files[file] ?? "", "utf8"),
    0,
  );
  return {
    schemaVersion: 1,
    manifestSha256: sha256(canonicalJson(input.manifest)),
    filePathSetSha256: sha256(canonicalJson(paths)),
    fileContentMapSha256: sha256(canonicalJson(contentMap)),
    sourcePathSetSha256: sha256(canonicalJson(sourcePaths)),
    sourceContentMapSha256: sha256(canonicalJson(sourceContentMap)),
    moduleUsageSha256: sha256(canonicalJson(input.moduleUsage)),
    moduleBindingSha256: sha256(canonicalJson(input.moduleBinding)),
    fileCount: paths.length,
    sourceFileCount: sourcePaths.length,
    totalUtf8BytesBucket: totalByteBucket(totalBytes),
  };
}

export function createPrototypeBuilderIdentity(input: {
  sdkPackageVersion: string;
  esbuildVersion: string;
  allowedImports: readonly string[];
  moduleMarker: string;
}) {
  return sha256(canonicalJson({
    runtimeContractVersion: PROTOTYPE_BUILDER_RUNTIME_CONTRACT_VERSION,
    implementation: "node-free-esbuild-static-resolver-v1",
    sdkPackageVersion: input.sdkPackageVersion,
    esbuildVersion: input.esbuildVersion,
    moduleMarker: input.moduleMarker,
    allowedImports: [...input.allowedImports].sort(),
  }));
}
