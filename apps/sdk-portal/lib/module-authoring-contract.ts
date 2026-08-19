import { createHash } from "node:crypto";
import {
  GAME_SDK_MODULE_CATALOG,
  GAME_SDK_MODULE_GOVERNANCE,
  GAME_SDK_CREATOR_CONFIGURABLE_MODULE_IDS,
  availableGameSdkPackageModuleIds,
  disabledGameSdkPackageModuleIds,
  normalizeGameSdkModuleProfile,
  requiredGameSdkPackageModuleIds,
  type GameSdkModuleProfile,
  type GameSdkModuleId,
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
  const availableModuleIds = availableGameSdkPackageModuleIds(profile);
  const availableModules = GAME_SDK_MODULE_CATALOG.filter((definition) => (
    availableModuleIds.includes(definition.id)
  ));
  return createHash("sha256").update(canonicalJson({
    schemaVersion: 3,
    environment: input.environment,
    sdkPackageVersion: input.sdkPackageVersion ?? platformRelease.sdkPackageVersion,
    sdkContractVersion: input.sdkContractVersion ?? platformRelease.sdkContractVersion,
    governance: GAME_SDK_MODULE_GOVERNANCE,
    profile,
    requiredModules,
    availableModules,
  })).digest("hex");
}

const LEGACY_RESOURCE_MODULE_IDS = [
  "content-source",
  "llm",
  "playing-cards",
  "drawing",
] as const satisfies readonly GameSdkModuleId[];

function legacyGameSdkModuleProfile(value: unknown): GameSdkModuleProfile {
  const profile = Object.fromEntries(
    GAME_SDK_MODULE_CATALOG.map((definition) => [
      definition.id,
      { mode: "required" as const },
    ]),
  ) as GameSdkModuleProfile;
  if (!value || typeof value !== "object" || Array.isArray(value)) return profile;
  const configurableIds = new Set<GameSdkModuleId>([
    ...GAME_SDK_CREATOR_CONFIGURABLE_MODULE_IDS,
    ...LEGACY_RESOURCE_MODULE_IDS,
  ]);
  const input = value as Record<string, unknown>;
  for (const id of configurableIds) {
    const raw = input[id];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const decision = raw as Record<string, unknown>;
    if (decision.mode !== "disabled") continue;
    const reason = typeof decision.reason === "string"
      ? decision.reason.trim().slice(0, 240)
      : "";
    profile[id] = reason
      ? { mode: "disabled", reason }
      : { mode: "disabled" };
  }
  return profile;
}

/** Verifies pre-available-resource confirmations without mutating their revision. */
export function legacyGameSdkModuleContractDigest(input: {
  moduleProfile: unknown;
  environment: "production" | "development";
  sdkPackageVersion?: string;
  sdkContractVersion?: number;
}) {
  const profile = legacyGameSdkModuleProfile(input.moduleProfile);
  const legacyCatalog = GAME_SDK_MODULE_CATALOG.map((definition) => {
    const legacyDefinition = Object.fromEntries(
      Object.entries(definition).filter(([key]) => key !== "profilePolicy"),
    ) as Omit<typeof definition, "profilePolicy">;
    if (!LEGACY_RESOURCE_MODULE_IDS.includes(definition.id as typeof LEGACY_RESOURCE_MODULE_IDS[number])) {
      return legacyDefinition;
    }
    return {
      ...legacyDefinition,
      authority: "game-derived" as const,
      creatorVisibility: "configurable" as const,
      creatorMutability: "owner-review" as const,
      playerVisibility: "read-only" as const,
      playerMutability: "none" as const,
      proposalEligible: true,
      packageTreatment: "module-usage" as const,
      runtimePolicySource: "game-package" as const,
    };
  });
  const legacyGovernance = Object.fromEntries(
    legacyCatalog.map((definition) => [definition.id, {
      authority: definition.authority,
      creatorVisibility: definition.creatorVisibility,
      creatorMutability: definition.creatorMutability,
      playerVisibility: definition.playerVisibility,
      playerMutability: definition.playerMutability,
      proposalEligible: definition.proposalEligible,
      packageTreatment: definition.packageTreatment,
      runtimePolicySource: definition.runtimePolicySource,
    }]),
  );
  const requiredModules = legacyCatalog.filter((definition) => (
    definition.packageTreatment === "module-usage"
    && profile[definition.id].mode === "required"
  ));
  return createHash("sha256").update(canonicalJson({
    schemaVersion: 2,
    environment: input.environment,
    sdkPackageVersion: input.sdkPackageVersion ?? platformRelease.sdkPackageVersion,
    sdkContractVersion: input.sdkContractVersion ?? platformRelease.sdkContractVersion,
    governance: legacyGovernance,
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
  const availableModuleIds = availableGameSdkPackageModuleIds(input.moduleProfile);
  const availableModules = GAME_SDK_MODULE_CATALOG.filter((definition) => (
    availableModuleIds.includes(definition.id)
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
    availableModuleIds,
    disabledModuleIds,
    disabledModules,
    requiredModules,
    availableModules,
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
