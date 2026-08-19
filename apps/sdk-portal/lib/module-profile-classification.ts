import {
  GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG,
  normalizeGameSdkModuleProfile,
  type GameSdkModuleId,
} from "@game-fields/game-sdk/modules";

export type CreatorModuleClassification = {
  required: GameSdkModuleId[];
  removable: GameSdkModuleId[];
  optional: GameSdkModuleId[];
  available: GameSdkModuleId[];
  standard: GameSdkModuleId[];
};

export function classifyCreatorGameModules(
  profile: unknown,
): CreatorModuleClassification {
  const normalized = normalizeGameSdkModuleProfile(profile);
  const classification: CreatorModuleClassification = {
    required: [],
    removable: [],
    optional: [],
    available: [],
    standard: [],
  };
  for (const definition of GAME_SDK_CREATOR_VISIBLE_MODULE_CATALOG) {
    if (definition.profilePolicy === "platform-standard") {
      classification.standard.push(definition.id);
    } else if (definition.profilePolicy === "available") {
      classification.available.push(definition.id);
    } else if (definition.creatorVisibility === "read-only") {
      classification.required.push(definition.id);
    } else if (normalized[definition.id].mode === "disabled") {
      classification.optional.push(definition.id);
    } else {
      classification.removable.push(definition.id);
    }
  }
  return classification;
}
