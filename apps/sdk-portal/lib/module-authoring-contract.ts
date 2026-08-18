import { createHash } from "node:crypto";
import {
  GAME_SDK_MODULE_CATALOG,
  GAME_SDK_MODULE_GOVERNANCE,
  disabledGameSdkPackageModuleIds,
  normalizeGameSdkModuleProfile,
  requiredGameSdkPackageModuleIds,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import platformRelease from "../../../config/platform-release.json" with { type: "json" };
import { sdkPortalReleaseProfile } from "./sdk-release-profile.ts";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  )).join(",")}}`;
}

export function gameSdkModuleContractDigest(input: {
  moduleProfile: unknown;
  environment: "production" | "development";
  sdkPackageVersion?: string;
  sdkContractVersion?: number;
}) {
  const profile = normalizeGameSdkModuleProfile(input.moduleProfile);
  const requiredModuleIds = requiredGameSdkPackageModuleIds(profile);
  const requiredModules = GAME_SDK_MODULE_CATALOG.filter((definition) => (
    requiredModuleIds.includes(definition.id)
  ));
  return createHash("sha256").update(canonicalJson({
    schemaVersion: 2,
    environment: input.environment,
    sdkPackageVersion: input.sdkPackageVersion ?? platformRelease.sdkPackageVersion,
    sdkContractVersion: input.sdkContractVersion ?? platformRelease.sdkContractVersion,
    governance: GAME_SDK_MODULE_GOVERNANCE,
    profile,
    requiredModules,
  })).digest("hex");
}

export function createGameSdkModuleContract(input: {
  moduleProfile: GameSdkModuleProfile;
  moduleProfileRevision: string;
  origin?: string;
}) {
  const environment = sdkPortalReleaseProfile(input.origin).environment;
  const requiredModuleIds = requiredGameSdkPackageModuleIds(input.moduleProfile);
  const requiredModules = GAME_SDK_MODULE_CATALOG.filter((definition) => (
    requiredModuleIds.includes(definition.id)
  ));
  const disabledModuleIds = disabledGameSdkPackageModuleIds(input.moduleProfile);
  const disabledModules = GAME_SDK_MODULE_CATALOG.filter((definition) => (
    disabledModuleIds.includes(definition.id)
  ));
  return {
    environment,
    sdkPackage: {
      name: "@game-fields/game-sdk",
      version: platformRelease.sdkPackageVersion,
    },
    sdkPackageVersion: platformRelease.sdkPackageVersion,
    sdkContractVersion: platformRelease.sdkContractVersion,
    moduleProfileRevision: input.moduleProfileRevision,
    moduleContractDigest: gameSdkModuleContractDigest({
      moduleProfile: input.moduleProfile,
      environment,
    }),
    requiredModuleIds,
    disabledModuleIds,
    disabledModules,
    requiredModules,
    editableByAi: false as const,
  };
}

export function sharedGameSourceSha256(files: Readonly<Record<string, string>>) {
  const sourcePaths = Object.keys(files)
    .filter((file) => file.startsWith("source/"))
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  if (sourcePaths.length === 0) throw new Error("MODULE_SHARED_SOURCE_MISSING");
  const hash = createHash("sha256");
  for (const sourcePath of sourcePaths) {
    hash.update(sourcePath).update("\0").update(files[sourcePath]).update("\0");
  }
  return hash.digest("hex");
}

export type GamePackageAuthoringManifestBinding = {
  environment: "production" | "development";
  moduleProfileRevision: string;
  moduleContractDigest: string;
  prototypeRevision: string;
  sharedSourceSha256: string;
};

export function bindGamePackageAuthoringManifest(
  files: unknown,
  binding: GamePackageAuthoringManifestBinding,
) {
  if (!Array.isArray(files)) throw new Error("GAME_SDK_PACKAGE_FILES_REQUIRED");
  let found = false;
  const bound = files.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const file = raw as Record<string, unknown>;
    if (file.path !== "game-fields-package.json") return raw;
    if (file.encoding !== "utf-8" || typeof file.content !== "string") {
      throw new Error("GAME_SDK_PACKAGE_MANIFEST_INVALID");
    }
    let manifest: unknown;
    try {
      manifest = JSON.parse(file.content);
    } catch {
      throw new Error("GAME_SDK_PACKAGE_MANIFEST_INVALID");
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error("GAME_SDK_PACKAGE_MANIFEST_INVALID");
    }
    found = true;
    return {
      ...file,
      content: `${JSON.stringify({ ...manifest, authoring: binding }, null, 2)}\n`,
    };
  });
  if (!found) throw new Error("GAME_SDK_PACKAGE_MANIFEST_INVALID");
  return bound;
}
