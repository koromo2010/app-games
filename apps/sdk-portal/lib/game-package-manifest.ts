import { createHash } from "node:crypto";
import {
  assertGameManifest,
  type GameSdkManifest,
} from "@game-fields/game-sdk";
import type { PreparedUploadFile } from "./mock-git-store";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_PORTABLE_SERVER_BUNDLE_BYTES = 1024 * 1024;

export type GameFieldsPackageManifest = {
  schemaVersion: 1;
  gameId: string;
  sdkPackageVersion: string;
  sdkContractVersion: number;
  manifest: GameSdkManifest;
  client: {
    entry: string;
  };
  server: {
    entry: "server.bundle.js";
    bundleSha256: string;
    appSetSource: "source/app-set.ts";
    appSetSourceSha256: string;
  };
};

function fileBytes(file: PreparedUploadFile) {
  return file.encoding === "base64"
    ? Buffer.from(file.content, "base64")
    : Buffer.from(file.content, "utf8");
}

function sha256(file: PreparedUploadFile) {
  return createHash("sha256").update(fileBytes(file)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function normalizedPackageFile(file: PreparedUploadFile) {
  if (file.encoding === "base64") return fileBytes(file);
  const normalizedText = file.content.replace(/\r\n?/g, "\n");
  if (!file.path.toLowerCase().endsWith(".json")) {
    return Buffer.from(normalizedText, "utf8");
  }
  try {
    return Buffer.from(`${canonicalJson(JSON.parse(normalizedText))}\n`, "utf8");
  } catch {
    throw new Error(`GAME_SDK_PACKAGE_JSON_INVALID:${file.path}`);
  }
}

/**
 * Canonical tree hash. Paths are UTF-8 byte sorted, text uses LF, JSON keys are
 * recursively sorted, and binary assets retain their exact bytes.
 */
export function gameFieldsPackageRootSha256(
  files: readonly PreparedUploadFile[],
) {
  const hash = createHash("sha256");
  const ordered = [...files].sort((left, right) => (
    Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8"))
  ));
  for (const file of ordered) {
    const content = normalizedPackageFile(file);
    hash.update(Buffer.from(file.path, "utf8"));
    hash.update("\0");
    hash.update(createHash("sha256").update(content).digest());
    hash.update("\0");
  }
  return hash.digest("hex");
}

function textFile(files: ReadonlyMap<string, PreparedUploadFile>, path: string) {
  const file = files.get(path);
  if (!file || file.encoding !== "utf-8") {
    throw new Error(`GAME_SDK_PACKAGE_TEXT_FILE_REQUIRED:${path}`);
  }
  return file.content;
}

export function parseGameFieldsPackageManifest(input: {
  gameId: string;
  files: readonly PreparedUploadFile[];
}) {
  const files = new Map(input.files.map((file) => [file.path, file]));
  let parsed: unknown;
  try {
    parsed = JSON.parse(textFile(files, "game-fields-package.json"));
  } catch {
    throw new Error("GAME_SDK_PACKAGE_MANIFEST_INVALID");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("GAME_SDK_PACKAGE_MANIFEST_INVALID");
  }
  const candidate = parsed as Partial<GameFieldsPackageManifest>;
  const clientEntry = candidate.client?.entry ?? "";
  if (
    candidate.schemaVersion !== 1
    || candidate.gameId !== input.gameId
    || typeof candidate.sdkPackageVersion !== "string"
    || !candidate.sdkPackageVersion.trim()
    || !Number.isSafeInteger(candidate.sdkContractVersion)
    || candidate.sdkContractVersion! < 1
    || !candidate.manifest
    || candidate.manifest.id !== input.gameId
    || typeof clientEntry !== "string"
    || !/\.html$/i.test(clientEntry)
    || clientEntry.startsWith("source/")
    || !files.has(clientEntry)
    || candidate.server?.entry !== "server.bundle.js"
    || candidate.server.appSetSource !== "source/app-set.ts"
    || !SHA256_PATTERN.test(candidate.server.bundleSha256 ?? "")
    || !SHA256_PATTERN.test(candidate.server.appSetSourceSha256 ?? "")
  ) {
    throw new Error("GAME_SDK_PACKAGE_MANIFEST_INVALID");
  }
  assertGameManifest(candidate.manifest);

  const serverBundle = files.get("server.bundle.js");
  const appSetSource = files.get("source/app-set.ts");
  if (!serverBundle || !appSetSource) {
    throw new Error("GAME_SDK_PACKAGE_MANIFEST_INVALID");
  }
  if (serverBundle.bytes > MAX_PORTABLE_SERVER_BUNDLE_BYTES) {
    throw new Error("GAME_SDK_PACKAGE_SERVER_BUNDLE_TOO_LARGE");
  }
  const actualBundleSha256 = sha256(serverBundle);
  const actualAppSetSourceSha256 = sha256(appSetSource);
  if (actualBundleSha256 !== candidate.server.bundleSha256) {
    throw new Error("GAME_SDK_PACKAGE_SERVER_HASH_MISMATCH");
  }
  if (actualAppSetSourceSha256 !== candidate.server.appSetSourceSha256) {
    throw new Error("GAME_SDK_PACKAGE_APP_SET_HASH_MISMATCH");
  }

  return {
    manifest: candidate as GameFieldsPackageManifest,
    bundleSha256: actualBundleSha256,
    appSetSourceSha256: actualAppSetSourceSha256,
    packageRootSha256: gameFieldsPackageRootSha256(input.files),
  };
}
