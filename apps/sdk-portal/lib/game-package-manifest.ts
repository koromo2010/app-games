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
  };
}
