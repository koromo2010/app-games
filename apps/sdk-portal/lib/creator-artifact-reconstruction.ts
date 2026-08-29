import { createHash } from "node:crypto";
import {
  verifyOriginalDataPreservationArchive,
  type OriginalDataPreservationArtifactManifest,
} from "./original-data-preservation.ts";
import { buildNodeFreeGamePackage } from "./node-free-game-package.ts";
import {
  createStoredZip,
  extractStoredZip,
  type StoredZipEntry,
} from "./stored-zip.ts";
import {
  resolveRuntimeExecutionArtifact,
} from "../../../packages/sdk-runtime-artifact/src/index.ts";
import type { GameSdkModuleBinding } from "../../../packages/game-sdk/src/module-usage.ts";
import { validateGameSdkMockQuality } from "../../../packages/game-sdk/src/mock-quality.ts";

export const t131A4PhaseId = "T-131-A4" as const;
export const t131A4Targets = ["moi-lab2", "yabobojpn-lab"] as const;
export type T131A4Target = (typeof t131A4Targets)[number];
export const t131A4ArchiveBytes = 14_375_278;
export const t131A4ArchiveSha256 =
  "0919a38bec7dc408f69b1ace799e7901a8ea419bf33fdb8b22bc47e0ac13a9f5" as const;
export const t131A4A0SourceMainCommit =
  "008b9867bc59b1add5aafa03346e1414a1a889e6" as const;
export const t131A4LocalParent =
  "98dec9adf87d3876998275b8a70326e8a8214419" as const;
export const t131A4ConverterVersion =
  "game-fields-t131-a4-current-format-v1" as const;
export const t131A4A3SourceProof = Object.freeze({
  operationId: "fa5eca14-a961-4bd1-9e68-78a609895971",
  terminalReceipt: "f449b3b2114ef863ea290d26c123a40ac3038e6e9861a3a576cb5bc2b9d35162",
  state: "quarantined",
  visibility: "non-public",
  ownerBinding: "unbound",
  grantState: "absent",
  releaseState: "blocked",
  publication: "blocked",
} as const);

const sha1Pattern = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const gameIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const allowedMockExtensions = new Set([
  ".html", ".css", ".js", ".mjs", ".json", ".txt", ".md", ".svg",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2",
  ".mp3", ".ogg", ".wav",
]);
const requiredRebuildInputs = [
  "index.html",
  "styles.css",
  "mock.js",
  "preview.json",
  "source/app-set.ts",
  "source/contracts.ts",
  "source/manifest.ts",
  "source/server-module.ts",
  "source/game-client.tsx",
  "source/prototype-adapter.ts",
] as const;

export type T131A4ArtifactFile = {
  path: string;
  sourcePath: string;
  archivePath: string;
  mode: "100644";
  bytes: number;
  blobSha: string;
  contentSha256: string;
  content: Buffer;
};

export type T131A4ArtifactLocator = {
  target: T131A4Target;
  kind: "mock" | "package";
  gameId: string;
  originalRevision: string;
  originalTreeSha: string;
  sourcePrefix: string;
  references: readonly string[];
  files: readonly T131A4ArtifactFile[];
};

export type T131A4CompatibilityClass =
  | "DIRECTLY_VALID"
  | "DETERMINISTICALLY_CONVERTIBLE"
  | "DETERMINISTICALLY_REBUILDABLE"
  | "UNAVAILABLE_FOR_FAITHFUL_RECONSTRUCTION";

export type T131A4CurrentFormatFile = {
  path: string;
  bytes: number;
  sha256: string;
  content: Buffer;
};

export type T131A4LocatorCompatibility = {
  locatorId: string;
  target: T131A4Target;
  kind: "mock" | "package";
  gameId: string;
  originalRevision: string;
  classification: T131A4CompatibilityClass;
  converterVersion: typeof t131A4ConverterVersion;
  canonicalInputSha256: string;
  canonicalOutputSha256: string | null;
  packageRootSha256: string | null;
  serverBundleSha256: string | null;
  appSetSourceSha256: string | null;
  reason: string;
  files: readonly T131A4CurrentFormatFile[];
};

export type T131A4TargetProvenance = {
  schemaVersion: 1;
  target: T131A4Target;
  locators: Array<{
    locatorId: string;
    kind: "mock" | "package";
    gameId: string;
    originalRevision: string;
    originalTreeSha: string;
    originalSourcePrefix: string;
    references: readonly string[];
    classification: Exclude<T131A4CompatibilityClass, "UNAVAILABLE_FOR_FAITHFUL_RECONSTRUCTION">;
    bundlePrefix: string;
    futureStoragePrefix: string;
    inputFiles: Array<{
      sourcePath: string;
      archivePath: string;
      bytes: number;
      gitBlobSha: string;
      sha256: string;
    }>;
    outputFiles: Array<{
      bundlePath: string;
      futureStoragePath: string;
      bytes: number;
      sha256: string;
    }>;
    originalToOutputs: Array<{
      originalSourcePath: string;
      outputs: Array<{ futureStoragePath: string; sha256: string }>;
    }>;
  }>;
};

export type T131A4TargetBundleManifest = {
  schemaVersion: 1;
  phaseId: typeof t131A4PhaseId;
  artifactType: "TARGET_ONLY_CURRENT_FORMAT_RECONSTRUCTION_BUNDLE";
  target: T131A4Target;
  localParent: typeof t131A4LocalParent;
  a0: { bytes: number; sha256: string; sourceMainCommit: typeof t131A4A0SourceMainCommit };
  runtimeBoundary:
    | { kind: "A3_PROVEN"; proof: typeof t131A4A3SourceProof }
    | { kind: "ARTIFACT_BYTES_ONLY"; linkageAuthorization: "NOT_GRANTED" };
  converterVersion: typeof t131A4ConverterVersion;
  locatorCount: number;
  inputFileCount: number;
  outputFileCount: number;
  outputBytes: number;
  outputSetSha256: string;
  provenanceSha256: string;
  compatibilitySha256: string;
  ready: true;
  historicalRestorationClaim: false;
  externalWrites: 0;
};

export type T131A4TargetBundle = {
  target: T131A4Target;
  archive: Buffer;
  archiveSha256: string;
  manifest: T131A4TargetBundleManifest;
  provenance: T131A4TargetProvenance;
  compatibility: readonly Omit<T131A4LocatorCompatibility, "files">[];
};

export type T131A4AggregateIndex = {
  schemaVersion: 1;
  phaseId: typeof t131A4PhaseId;
  artifactType: "TWO_TARGET_RECONSTRUCTION_AGGREGATE_INDEX";
  localParent: typeof t131A4LocalParent;
  a0: { bytes: number; sha256: string; sourceMainCommit: typeof t131A4A0SourceMainCommit };
  targets: Array<{
    target: T131A4Target;
    bundleBytes: number;
    bundleSha256: string;
    locatorCount: number;
    outputFileCount: number;
    outputBytes: number;
    outputSetSha256: string;
    provenanceSha256: string;
    compatibilitySha256: string;
  }>;
  targetCount: 2;
  ready: true;
  transferAuthorized: false;
  externalWrites: 0;
};

export type T131A4ReconstructionResult = {
  bundles: readonly [T131A4TargetBundle, T131A4TargetBundle];
  aggregateIndex: T131A4AggregateIndex;
  aggregateIndexBytes: Buffer;
  aggregateIndexSha256: string;
};

export type T131A4PackageRebuilder = (input: {
  target: T131A4Target;
  locator: T131A4ArtifactLocator;
  files: Readonly<Record<string, string>>;
  manifest: unknown;
  moduleBinding: GameSdkModuleBinding;
}) => Promise<readonly T131A4CurrentFormatFile[]>;

export class T131A4ArtifactReconstructionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "T131A4ArtifactReconstructionError";
  }
}

function fail(code: string): never {
  throw new T131A4ArtifactReconstructionError(code);
}

export function canonicalT131A4Json(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalT131A4Json).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalT131A4Json(record[key])}`
  )).join(",")}}`;
}

export function t131A4JsonDocument(value: unknown) {
  return Buffer.from(`${JSON.stringify(JSON.parse(canonicalT131A4Json(value)), null, 2)}\n`, "utf8");
}

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function gitBlobSha(value: Uint8Array) {
  const bytes = Buffer.from(value);
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

function safeRelativePath(value: string) {
  return value.length > 0
    && value.length <= 500
    && !value.startsWith("/")
    && !value.endsWith("/")
    && !value.includes("\\")
    && !value.includes("\0")
    && value.split("/").length <= 20
    && value.split("/").every((part) => part && part !== "." && part !== ".." && part.length <= 120);
}

function locatorId(locator: T131A4ArtifactLocator) {
  return `${locator.kind}:${locator.gameId}:${locator.originalRevision}`;
}

function parseJson<T>(entries: ReadonlyMap<string, Buffer>, path: string): T {
  const value = entries.get(path);
  if (!value) fail("A4_ARCHIVE_STRUCTURE_MISMATCH");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value)) as T;
  } catch {
    fail("A4_ARCHIVE_STRUCTURE_MISMATCH");
  }
}

export function materializeT131A4TargetArtifactSet(input: {
  entries: readonly StoredZipEntry[];
  artifactManifest: OriginalDataPreservationArtifactManifest;
  target: T131A4Target;
}) {
  const { artifactManifest, target } = input;
  if (
    artifactManifest.formatVersion !== 1
    || artifactManifest.target !== target
    || artifactManifest.status !== "COMPLETE"
    || artifactManifest.locatorCount <= 0
    || artifactManifest.locatorCount !== artifactManifest.locators.length
    || artifactManifest.presentCount !== artifactManifest.locators.length
    || artifactManifest.missingCount !== 0
    || artifactManifest.unavailableCount !== 0
  ) fail("A4_TARGET_MANIFEST_MISMATCH");

  const archiveFiles = new Map(input.entries.map((entry) => [entry.name, entry.content]));
  const seenArchivePaths = new Set<string>();
  const seenLocators = new Set<string>();
  const locators = artifactManifest.locators.map((source): T131A4ArtifactLocator => {
    if (
      source.target !== target
      || (source.kind !== "mock" && source.kind !== "package")
      || !gameIdPattern.test(source.gameId)
      || !sha1Pattern.test(source.revision)
      || source.commitSha !== source.revision
      || !sha1Pattern.test(source.treeSha)
      || !Array.isArray(source.references)
      || source.references.length === 0
      || source.references.some((reference) => typeof reference !== "string" || !reference)
      || new Set(source.references).size !== source.references.length
    ) fail("A4_TARGET_LOCATOR_MISMATCH");
    const sourcePrefix = source.kind === "mock"
      ? `previews/${target}/${source.gameId}/mock/`
      : `packages/${target}/${source.gameId}/bundle/`;
    const id = `${source.kind}:${source.gameId}:${source.revision}`;
    if (source.sourcePrefix !== sourcePrefix || seenLocators.has(id)) {
      fail("A4_TARGET_LOCATOR_MISMATCH");
    }
    seenLocators.add(id);
    const foldedPaths = new Set<string>();
    const files = source.files.map((file): T131A4ArtifactFile => {
      if (
        typeof file.sourcePath !== "string"
        || !file.sourcePath.startsWith(sourcePrefix)
        || file.mode !== "100644"
        || !Number.isSafeInteger(file.bytes)
        || file.bytes < 0
        || file.bytes > 2 * 1024 * 1024
        || !sha1Pattern.test(file.blobSha)
        || !sha256Pattern.test(file.contentSha256)
      ) fail("A4_TARGET_FILE_MISMATCH");
      const path = file.sourcePath.slice(sourcePrefix.length);
      const expectedArchivePath =
        `git-artifacts/${target}/${source.revision}/${source.kind}/${source.gameId}/${path}`;
      const folded = path.toLocaleLowerCase("en-US");
      const content = archiveFiles.get(file.archivePath);
      if (
        !safeRelativePath(path)
        || foldedPaths.has(folded)
        || file.archivePath !== expectedArchivePath
        || seenArchivePaths.has(file.archivePath)
        || !content
        || content.byteLength !== file.bytes
        || sha256(content) !== file.contentSha256
        || gitBlobSha(content) !== file.blobSha
      ) fail("A4_TARGET_FILE_HASH_MISMATCH");
      foldedPaths.add(folded);
      seenArchivePaths.add(file.archivePath);
      return { path, ...file, content: Buffer.from(content) };
    }).sort((left, right) => left.path.localeCompare(right.path));
    if (files.length === 0) fail("A4_TARGET_FILE_MISMATCH");
    return {
      target,
      kind: source.kind,
      gameId: source.gameId,
      originalRevision: source.revision,
      originalTreeSha: source.treeSha,
      sourcePrefix,
      references: [...source.references].sort(),
      files,
    };
  }).sort((left, right) => locatorId(left).localeCompare(locatorId(right)));
  const fileCount = locators.reduce((count, locator) => count + locator.files.length, 0);
  if (fileCount !== artifactManifest.fileCount) fail("A4_TARGET_FILE_COUNT_MISMATCH");
  return { target, locators, fileCount };
}

function assertExactArtifactNamespace(entries: readonly StoredZipEntry[]) {
  const manifests = entries
    .map(({ name }) => /^git-artifacts\/([^/]+)\/manifest\.json$/.exec(name)?.[1])
    .filter((value): value is string => Boolean(value))
    .sort();
  if (manifests.join("|") !== [...t131A4Targets].sort().join("|")) {
    fail("A4_EXACT_TWO_TARGET_SELECTION_MISMATCH");
  }
  for (const { name } of entries) {
    const match = /^git-artifacts\/([^/]+)\//.exec(name);
    if (match && !t131A4Targets.includes(match[1] as T131A4Target)) {
      fail("A4_EXACT_TWO_TARGET_SELECTION_MISMATCH");
    }
  }
}

function readTargetSets(entries: readonly StoredZipEntry[]) {
  assertExactArtifactNamespace(entries);
  const files = new Map(entries.map((entry) => [entry.name, entry.content]));
  const sets = t131A4Targets.map((target) => materializeT131A4TargetArtifactSet({
    entries,
    target,
    artifactManifest: parseJson<OriginalDataPreservationArtifactManifest>(
      files,
      `git-artifacts/${target}/manifest.json`,
    ),
  })) as [
    ReturnType<typeof materializeT131A4TargetArtifactSet>,
    ReturnType<typeof materializeT131A4TargetArtifactSet>,
  ];
  const archivePaths = sets.flatMap(({ locators }) => (
    locators.flatMap(({ files: locatorFiles }) => locatorFiles.map(({ archivePath }) => archivePath))
  ));
  if (new Set(archivePaths).size !== archivePaths.length) {
    fail("A4_CROSS_TARGET_FILE_ATTRIBUTION_MISMATCH");
  }
  return sets;
}

function validateMock(locator: T131A4ArtifactLocator) {
  validateMockFileEnvelope(currentFiles(locator));
}

function validateMockFileEnvelope(files: readonly T131A4CurrentFormatFile[]) {
  const paths = files.map(({ path }) => path);
  let total = 0;
  if (
    files.length > 32
    || !paths.includes("index.html")
    || !paths.includes("styles.css")
    || !paths.includes("mock.js")
  ) fail("A4_CURRENT_MOCK_FORMAT_INVALID");
  for (const file of files) {
    const dot = file.path.lastIndexOf(".");
    if (dot < 0 || !allowedMockExtensions.has(file.path.slice(dot).toLowerCase())) {
      fail("A4_CURRENT_MOCK_FORMAT_INVALID");
    }
    total += file.content.byteLength;
  }
  if (total > 5 * 1024 * 1024) fail("A4_CURRENT_MOCK_FORMAT_INVALID");
}

function validateCurrentMockFiles(files: readonly T131A4CurrentFormatFile[]) {
  validateMockFileEnvelope(files);
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const preview = byPath.get("preview.json");
  if (!preview) fail("A4_CURRENT_MOCK_FORMAT_INVALID");
  try {
    validateGameSdkMockQuality({
      files: {
        "index.html": new TextDecoder("utf-8", { fatal: true }).decode(byPath.get("index.html")),
        "styles.css": new TextDecoder("utf-8", { fatal: true }).decode(byPath.get("styles.css")),
        "mock.js": new TextDecoder("utf-8", { fatal: true }).decode(byPath.get("mock.js")),
        "preview.json": new TextDecoder("utf-8", { fatal: true }).decode(preview),
      },
    });
  } catch {
    fail("A4_CURRENT_MOCK_FORMAT_INVALID");
  }
}

function currentFiles(locator: T131A4ArtifactLocator): T131A4CurrentFormatFile[] {
  return locator.files.map(({ path, content }) => ({
    path,
    bytes: content.byteLength,
    sha256: sha256(content),
    content: Buffer.from(content),
  }));
}

function canonicalFileSetSha256(files: readonly T131A4CurrentFormatFile[]) {
  return sha256(canonicalT131A4Json(
    [...files]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(({ path, bytes, sha256: digest }) => ({ path, bytes, sha256: digest })),
  ));
}

async function validatePackage(
  locator: T131A4ArtifactLocator,
  files: readonly T131A4CurrentFormatFile[],
) {
  const prefix = `packages/${locator.target}/${locator.gameId}/bundle/`;
  const byDigest = new Map(files.map((file) => [file.sha256, file.content]));
  return resolveRuntimeExecutionArtifact({
    locator: {
      instanceId: locator.target,
      gameId: locator.gameId,
      revision: locator.originalRevision,
    },
    reader: {
      async readCommit(revision) {
        return revision === locator.originalRevision
          ? { commitSha: revision, treeSha: locator.originalTreeSha }
          : null;
      },
      async readTree(treeSha) {
        return treeSha === locator.originalTreeSha
          ? files.map((file) => ({
              path: `${prefix}${file.path}`,
              type: "blob" as const,
              sha: file.sha256,
              bytes: file.bytes,
              mode: "100644",
            }))
          : null;
      },
      async readBlob(blobSha) {
        return byDigest.get(blobSha) ?? null;
      },
    },
  });
}

function parseRebuildInput(locator: T131A4ArtifactLocator) {
  const byPath = new Map(locator.files.map((file) => [file.path, file.content]));
  if (requiredRebuildInputs.some((path) => !byPath.has(path))) return null;
  let packageManifest: {
    manifest?: unknown;
    authoring?: Partial<GameSdkModuleBinding>;
  };
  try {
    packageManifest = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(byPath.get("game-fields-package.json")),
    ) as typeof packageManifest;
  } catch {
    return null;
  }
  const binding = packageManifest.authoring;
  if (
    !packageManifest.manifest
    || (binding?.environment !== "production" && binding?.environment !== "development")
    || typeof binding.moduleProfileRevision !== "string"
    || !binding.moduleProfileRevision
    || typeof binding.moduleContractDigest !== "string"
    || !binding.moduleContractDigest
    || typeof binding.sdkPackageVersion !== "string"
    || !binding.sdkPackageVersion
    || !Number.isSafeInteger(binding.sdkContractVersion)
  ) return null;
  const files: Record<string, string> = {};
  try {
    for (const path of requiredRebuildInputs) {
      files[path] = new TextDecoder("utf-8", { fatal: true }).decode(byPath.get(path)!);
    }
  } catch {
    return null;
  }
  return {
    files,
    manifest: packageManifest.manifest,
    moduleBinding: binding as GameSdkModuleBinding,
  };
}

const defaultPackageRebuilder: T131A4PackageRebuilder = async (input) => {
  const rebuilt = await buildNodeFreeGamePackage({
    gameId: input.locator.gameId,
    files: input.files,
    manifest: input.manifest,
    moduleBinding: input.moduleBinding,
  });
  return rebuilt.map((file) => {
    const content = Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8");
    return {
      path: file.path,
      bytes: content.byteLength,
      sha256: sha256(content),
      content,
    };
  });
};

function unavailableCompatibility(
  locator: T131A4ArtifactLocator,
  inputDigest: string,
  reason: string,
): T131A4LocatorCompatibility {
  return {
    locatorId: locatorId(locator),
    target: locator.target,
    kind: locator.kind,
    gameId: locator.gameId,
    originalRevision: locator.originalRevision,
    classification: "UNAVAILABLE_FOR_FAITHFUL_RECONSTRUCTION",
    converterVersion: t131A4ConverterVersion,
    canonicalInputSha256: inputDigest,
    canonicalOutputSha256: null,
    packageRootSha256: null,
    serverBundleSha256: null,
    appSetSourceSha256: null,
    reason,
    files: [],
  };
}

export async function classifyT131A4Locator(
  locator: T131A4ArtifactLocator,
  rebuildPackage: T131A4PackageRebuilder = defaultPackageRebuilder,
): Promise<T131A4LocatorCompatibility> {
  const direct = currentFiles(locator);
  const inputDigest = canonicalFileSetSha256(direct);
  if (locator.kind === "mock") {
    try {
      validateMock(locator);
      return {
        locatorId: locatorId(locator),
        target: locator.target,
        kind: locator.kind,
        gameId: locator.gameId,
        originalRevision: locator.originalRevision,
        classification: "DIRECTLY_VALID",
        converterVersion: t131A4ConverterVersion,
        canonicalInputSha256: inputDigest,
        canonicalOutputSha256: inputDigest,
        packageRootSha256: null,
        serverBundleSha256: null,
        appSetSourceSha256: null,
        reason: "CURRENT_MOCK_ARTIFACT_VALID",
        files: direct,
      };
    } catch {
      return unavailableCompatibility(locator, inputDigest, "CURRENT_MOCK_INPUTS_INCOMPLETE");
    }
  }

  try {
    const validated = await validatePackage(locator, direct);
    return {
      locatorId: locatorId(locator),
      target: locator.target,
      kind: locator.kind,
      gameId: locator.gameId,
      originalRevision: locator.originalRevision,
      classification: "DIRECTLY_VALID",
      converterVersion: t131A4ConverterVersion,
      canonicalInputSha256: inputDigest,
      canonicalOutputSha256: canonicalFileSetSha256(direct),
      packageRootSha256: validated.packageRootSha256,
      serverBundleSha256: validated.serverBundleSha256,
      appSetSourceSha256: validated.appSetSourceSha256,
      reason: "CURRENT_PACKAGE_ARTIFACT_VALID",
      files: direct,
    };
  } catch {
    const rebuildInput = parseRebuildInput(locator);
    if (rebuildInput) {
      try {
        const rebuilt = [...await rebuildPackage({
          target: locator.target,
          locator,
          ...rebuildInput,
        })].sort((left, right) => left.path.localeCompare(right.path));
        const validated = await validatePackage(locator, rebuilt);
        return {
          locatorId: locatorId(locator),
          target: locator.target,
          kind: locator.kind,
          gameId: locator.gameId,
          originalRevision: locator.originalRevision,
          classification: "DETERMINISTICALLY_REBUILDABLE",
          converterVersion: t131A4ConverterVersion,
          canonicalInputSha256: inputDigest,
          canonicalOutputSha256: canonicalFileSetSha256(rebuilt),
          packageRootSha256: validated.packageRootSha256,
          serverBundleSha256: validated.serverBundleSha256,
          appSetSourceSha256: validated.appSetSourceSha256,
          reason: "COMPLETE_SOURCE_INPUTS_REBUILT_WITH_CURRENT_NODE_FREE_BUILDER",
          files: rebuilt,
        };
      } catch {
        return unavailableCompatibility(
          locator,
          inputDigest,
          "DETERMINISTIC_REBUILD_VALIDATION_FAILED",
        );
      }
    }
    return unavailableCompatibility(
      locator,
      inputDigest,
      "CURRENT_PACKAGE_OR_COMPLETE_REBUILD_INPUTS_UNAVAILABLE",
    );
  }
}

/** Applies the identity-bound legacy adapter before strict current-format checks. */
export function classifyT131A4NormalizedMock(
  locator: T131A4ArtifactLocator,
  files: readonly T131A4CurrentFormatFile[],
): T131A4LocatorCompatibility {
  if (locator.kind !== "mock") fail("A4_NORMALIZED_MOCK_KIND_INVALID");
  const inputDigest = canonicalFileSetSha256(currentFiles(locator));
  try {
    validateCurrentMockFiles(files);
  } catch {
    return unavailableCompatibility(locator, inputDigest, "CURRENT_MOCK_ADAPTER_OUTPUT_INVALID");
  }
  return {
    locatorId: locatorId(locator),
    target: locator.target,
    kind: locator.kind,
    gameId: locator.gameId,
    originalRevision: locator.originalRevision,
    classification: "DETERMINISTICALLY_CONVERTIBLE",
    converterVersion: t131A4ConverterVersion,
    canonicalInputSha256: inputDigest,
    canonicalOutputSha256: canonicalFileSetSha256(files),
    packageRootSha256: null,
    serverBundleSha256: null,
    appSetSourceSha256: null,
    reason: "LEGACY_MOCK_NORMALIZED_BY_VERSIONED_AUTHORING_ADAPTER",
    files,
  };
}

function secretFreeCompatibility(value: T131A4LocatorCompatibility) {
  const { files, ...secretFree } = value;
  void files;
  return secretFree;
}

function targetRuntimeBoundary(target: T131A4Target): T131A4TargetBundleManifest["runtimeBoundary"] {
  return target === "moi-lab2"
    ? { kind: "A3_PROVEN", proof: t131A4A3SourceProof }
    : { kind: "ARTIFACT_BYTES_ONLY", linkageAuthorization: "NOT_GRANTED" };
}

export async function createT131A4TargetBundle(input: {
  targetSet: ReturnType<typeof materializeT131A4TargetArtifactSet>;
  archiveCommitment: { bytes: number; sha256: string };
  rebuildPackage?: T131A4PackageRebuilder;
}) {
  const compatibility = await Promise.all(
    input.targetSet.locators.map((locator) => classifyT131A4Locator(
      locator,
      input.rebuildPackage,
    )),
  );
  if (compatibility.some(({ classification }) => (
    classification === "UNAVAILABLE_FOR_FAITHFUL_RECONSTRUCTION"
  ))) fail(`A4_TARGET_CURRENT_FORMAT_UNAVAILABLE_${input.targetSet.target}`);

  const provenance: T131A4TargetProvenance = {
    schemaVersion: 1,
    target: input.targetSet.target,
    locators: input.targetSet.locators.map((locator, index) => {
      const classified = compatibility[index]!;
      const bundlePrefix =
        `artifacts/${locator.originalRevision}/${locator.kind}/${locator.gameId}/`;
      const outputFiles = classified.files.map((file) => ({
        bundlePath: `${bundlePrefix}${file.path}`,
        futureStoragePath: `${locator.sourcePrefix}${file.path}`,
        bytes: file.bytes,
        sha256: file.sha256,
      }));
      return {
        locatorId: locatorId(locator),
        kind: locator.kind,
        gameId: locator.gameId,
        originalRevision: locator.originalRevision,
        originalTreeSha: locator.originalTreeSha,
        originalSourcePrefix: locator.sourcePrefix,
        references: locator.references,
        classification: classified.classification as Exclude<
          T131A4CompatibilityClass,
          "UNAVAILABLE_FOR_FAITHFUL_RECONSTRUCTION"
        >,
        bundlePrefix,
        futureStoragePrefix: locator.sourcePrefix,
        inputFiles: locator.files.map((file) => ({
          sourcePath: file.sourcePath,
          archivePath: file.archivePath,
          bytes: file.bytes,
          gitBlobSha: file.blobSha,
          sha256: file.contentSha256,
        })),
        outputFiles,
        originalToOutputs: locator.files.map((file) => ({
          originalSourcePath: file.sourcePath,
          outputs: classified.classification === "DIRECTLY_VALID"
            ? outputFiles.filter(({ futureStoragePath }) => futureStoragePath === file.sourcePath)
                .map(({ futureStoragePath, sha256: digest }) => ({
                  futureStoragePath,
                  sha256: digest,
                }))
            : outputFiles.map(({ futureStoragePath, sha256: digest }) => ({
                futureStoragePath,
                sha256: digest,
              })),
        })),
      };
    }),
  };
  if (provenance.locators.some(({ originalToOutputs }) => (
    originalToOutputs.some(({ outputs }) => outputs.length === 0)
  ))) fail("A4_PROVENANCE_MAPPING_INCOMPLETE");

  const provenanceBytes = t131A4JsonDocument(provenance);
  const compatibilitySecretFree = compatibility.map(secretFreeCompatibility);
  const compatibilityBytes = t131A4JsonDocument({
    schemaVersion: 1,
    target: input.targetSet.target,
    locators: compatibilitySecretFree,
  });
  const outputSet = provenance.locators.flatMap(({ outputFiles }) => outputFiles);
  const manifest: T131A4TargetBundleManifest = {
    schemaVersion: 1,
    phaseId: t131A4PhaseId,
    artifactType: "TARGET_ONLY_CURRENT_FORMAT_RECONSTRUCTION_BUNDLE",
    target: input.targetSet.target,
    localParent: t131A4LocalParent,
    a0: {
      ...input.archiveCommitment,
      sourceMainCommit: t131A4A0SourceMainCommit,
    },
    runtimeBoundary: targetRuntimeBoundary(input.targetSet.target),
    converterVersion: t131A4ConverterVersion,
    locatorCount: input.targetSet.locators.length,
    inputFileCount: input.targetSet.fileCount,
    outputFileCount: outputSet.length,
    outputBytes: outputSet.reduce((total, file) => total + file.bytes, 0),
    outputSetSha256: sha256(canonicalT131A4Json(outputSet)),
    provenanceSha256: sha256(provenanceBytes),
    compatibilitySha256: sha256(compatibilityBytes),
    ready: true,
    historicalRestorationClaim: false,
    externalWrites: 0,
  };
  const artifactEntries = compatibility.flatMap((classified, index) => {
    const locator = input.targetSet.locators[index]!;
    const prefix = `artifacts/${locator.originalRevision}/${locator.kind}/${locator.gameId}/`;
    return classified.files.map((file) => ({
      name: `${prefix}${file.path}`,
      content: file.content,
    }));
  });
  const archive = createStoredZip([
    { name: "manifest.json", content: t131A4JsonDocument(manifest) },
    { name: "provenance.json", content: provenanceBytes },
    { name: "compatibility.json", content: compatibilityBytes },
    ...artifactEntries,
  ].sort((left, right) => left.name.localeCompare(right.name)));
  const result: T131A4TargetBundle = {
    target: input.targetSet.target,
    archive,
    archiveSha256: sha256(archive),
    manifest,
    provenance,
    compatibility: compatibilitySecretFree,
  };
  verifyT131A4TargetBundle(result.archive, result.target);
  return result;
}

export function verifyT131A4TargetBundle(archive: Uint8Array, expectedTarget: T131A4Target) {
  let entries: StoredZipEntry[];
  try {
    entries = extractStoredZip(archive);
  } catch {
    fail("A4_TARGET_BUNDLE_INVALID");
  }
  const files = new Map(entries.map((entry) => [entry.name, entry.content]));
  const manifest = parseJson<T131A4TargetBundleManifest>(files, "manifest.json");
  const provenance = parseJson<T131A4TargetProvenance>(files, "provenance.json");
  const compatibility = parseJson<{
    schemaVersion: 1;
    target: T131A4Target;
    locators: Array<Omit<T131A4LocatorCompatibility, "files">>;
  }>(files, "compatibility.json");
  if (
    manifest.target !== expectedTarget
    || provenance.target !== expectedTarget
    || compatibility.target !== expectedTarget
    || manifest.localParent !== t131A4LocalParent
    || manifest.provenanceSha256 !== sha256(files.get("provenance.json")!)
    || manifest.compatibilitySha256 !== sha256(files.get("compatibility.json")!)
    || manifest.ready !== true
    || manifest.historicalRestorationClaim !== false
    || provenance.locators.length !== manifest.locatorCount
    || compatibility.locators.length !== manifest.locatorCount
  ) fail("A4_TARGET_BUNDLE_INVALID");
  const expectedOutputs = provenance.locators.flatMap(({ outputFiles }) => outputFiles);
  if (
    expectedOutputs.length !== manifest.outputFileCount
    || expectedOutputs.reduce((total, file) => total + file.bytes, 0) !== manifest.outputBytes
    || sha256(canonicalT131A4Json(expectedOutputs)) !== manifest.outputSetSha256
  ) fail("A4_TARGET_BUNDLE_INVALID");
  for (const output of expectedOutputs) {
    const content = files.get(output.bundlePath);
    if (!content || content.byteLength !== output.bytes || sha256(content) !== output.sha256) {
      fail("A4_TARGET_BUNDLE_TAMPERED");
    }
  }
  const allowed = new Set([
    "manifest.json",
    "provenance.json",
    "compatibility.json",
    ...expectedOutputs.map(({ bundlePath }) => bundlePath),
  ]);
  if (
    entries.some(({ name }) => !allowed.has(name))
    || provenance.locators.some(({ originalSourcePrefix }) => (
      !originalSourcePrefix.startsWith(`previews/${expectedTarget}/`)
      && !originalSourcePrefix.startsWith(`packages/${expectedTarget}/`)
    ))
  ) fail("A4_TARGET_BUNDLE_CROSS_TARGET_CONTAMINATION");
  const reproduced = createStoredZip(entries.map(({ name, content }) => ({ name, content })));
  if (!Buffer.from(reproduced).equals(Buffer.from(archive))) {
    fail("A4_TARGET_BUNDLE_NOT_REPRODUCIBLE");
  }
  return { manifest, provenance, compatibility };
}

function createAggregateIndex(
  bundles: readonly [T131A4TargetBundle, T131A4TargetBundle],
  archiveCommitment: { bytes: number; sha256: string },
): T131A4AggregateIndex {
  return {
    schemaVersion: 1,
    phaseId: t131A4PhaseId,
    artifactType: "TWO_TARGET_RECONSTRUCTION_AGGREGATE_INDEX",
    localParent: t131A4LocalParent,
    a0: { ...archiveCommitment, sourceMainCommit: t131A4A0SourceMainCommit },
    targets: bundles.map((bundle) => ({
      target: bundle.target,
      bundleBytes: bundle.archive.byteLength,
      bundleSha256: bundle.archiveSha256,
      locatorCount: bundle.manifest.locatorCount,
      outputFileCount: bundle.manifest.outputFileCount,
      outputBytes: bundle.manifest.outputBytes,
      outputSetSha256: bundle.manifest.outputSetSha256,
      provenanceSha256: bundle.manifest.provenanceSha256,
      compatibilitySha256: bundle.manifest.compatibilitySha256,
    })),
    targetCount: 2,
    ready: true,
    transferAuthorized: false,
    externalWrites: 0,
  };
}

export async function reconstructT131A4TwoTargetBundlesFromVerifiedEntries(input: {
  entries: readonly StoredZipEntry[];
  archiveCommitment: { bytes: number; sha256: string };
  rebuildPackage?: T131A4PackageRebuilder;
}): Promise<T131A4ReconstructionResult> {
  if (
    !Number.isSafeInteger(input.archiveCommitment.bytes)
    || input.archiveCommitment.bytes <= 0
    || !sha256Pattern.test(input.archiveCommitment.sha256)
  ) fail("A4_ARCHIVE_COMMITMENT_INVALID");
  const sets = readTargetSets(input.entries);
  const bundles = await Promise.all(sets.map((targetSet) => createT131A4TargetBundle({
    targetSet,
    archiveCommitment: input.archiveCommitment,
    rebuildPackage: input.rebuildPackage,
  }))) as [T131A4TargetBundle, T131A4TargetBundle];
  if (bundles.map(({ target }) => target).join("|") !== t131A4Targets.join("|")) {
    fail("A4_EXACT_TWO_TARGET_SELECTION_MISMATCH");
  }
  const aggregateIndex = createAggregateIndex(bundles, input.archiveCommitment);
  const aggregateIndexBytes = t131A4JsonDocument(aggregateIndex);
  return {
    bundles,
    aggregateIndex,
    aggregateIndexBytes,
    aggregateIndexSha256: sha256(aggregateIndexBytes),
  };
}

export function verifyT131A4FixedArchive(archive: Uint8Array) {
  if (
    archive.byteLength !== t131A4ArchiveBytes
    || sha256(archive) !== t131A4ArchiveSha256
  ) fail("A4_ARCHIVE_OUTER_IDENTITY_MISMATCH");
  let entries: StoredZipEntry[];
  let verified: { targets?: unknown };
  try {
    verified = verifyOriginalDataPreservationArchive({ archive });
    entries = extractStoredZip(archive);
  } catch {
    fail("A4_ARCHIVE_INTERNAL_VERIFICATION_FAILED");
  }
  const entryFiles = new Map(entries.map((entry) => [entry.name, entry.content]));
  const source = parseJson<{
    sourceMainCommit?: unknown;
  }>(entryFiles, "db/source-observation.json");
  const migrationLedger = parseJson<{
    observedSchemaVersion?: unknown;
  }>(entryFiles, "db/migration-ledger.json");
  if (
    entries.length !== 598
    || source.sourceMainCommit !== t131A4A0SourceMainCommit
    || migrationLedger.observedSchemaVersion !== 9
    || !Array.isArray(verified.targets)
    || verified.targets.length !== 2
  ) fail("A4_A0_IDENTITY_MISMATCH");
  const checksums = entries.find(({ name }) => name === "SHA256SUMS")?.content
    .toString("utf8").trim().split("\n");
  if (checksums?.length !== 597) fail("A4_ARCHIVE_INTERNAL_VERIFICATION_FAILED");
  assertExactArtifactNamespace(entries);
  return {
    entries,
    archiveCommitment: { bytes: archive.byteLength, sha256: t131A4ArchiveSha256 },
  };
}

export async function prepareT131A4TwoTargetReconstruction(input: {
  archive: Uint8Array;
  rebuildPackage?: T131A4PackageRebuilder;
}) {
  const verified = verifyT131A4FixedArchive(input.archive);
  return reconstructT131A4TwoTargetBundlesFromVerifiedEntries({
    entries: verified.entries,
    archiveCommitment: verified.archiveCommitment,
    rebuildPackage: input.rebuildPackage,
  });
}

export function createT131A4FutureTransportDraft(result: T131A4ReconstructionResult) {
  const rows = result.aggregateIndex.targets.map((target) => (
    `| \`${target.target}\` | \`${target.bundleSha256}\` | ${target.outputFileCount} | \`${target.outputSetSha256}\` |`
  )).join("\n");
  return [
    "# T-131-A4 future target-bundle transport draft",
    "",
    "ARTIFACT_TYPE: DRAFT — NOT AUTHORIZED FOR EXECUTION",
    "",
    `- Local parent: \`${t131A4LocalParent}\``,
    `- A0 commitment: \`${result.aggregateIndex.a0.sha256}\``,
    `- Aggregate index SHA-256: \`${result.aggregateIndexSha256}\``,
    "",
    "| Target | Bundle SHA-256 | Output files | Output-set SHA-256 |",
    "| --- | --- | ---: | --- |",
    rows,
    "",
    "## Recommended future write shape",
    "",
    "Use two independent target operations, not one atomic two-target commit. The target path prefixes are disjoint, while moi-lab2 has a proven A3 quarantine boundary and yabobojpn-lab is artifact-bytes-only. Independent compare-and-swap operations preserve failure isolation and avoid inventing shared runtime state.",
    "",
    "For each separately authorized target operation:",
    "",
    "1. Read the actual artifact ref immediately before execution.",
    "2. Enumerate and verify every new path/hash from that target's provenance mapping.",
    "3. Preserve every unrelated path and blob.",
    "4. Assign a new operation identity; never reuse an old A4 operation ID or receipt.",
    "5. Create immutable objects, then perform one non-force compare-and-swap.",
    "6. Read back the ref, commit, tree, every target path/blob and operation marker exactly.",
    "7. Publish an aggregate completion record only after both independent read-backs pass.",
    "",
    "No transfer, Git write, ref update, runtime linkage, ownership binding, release or publication is authorized by this draft.",
    "",
  ].join("\n");
}
