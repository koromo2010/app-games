import {
  GAME_SDK_MODULE_CATALOG,
  normalizeGameSdkModuleProfile,
  type GameSdkModuleId,
} from "@game-fields/game-sdk/modules";

export type CreatorModuleClassification = {
  required: GameSdkModuleId[];
  removable: GameSdkModuleId[];
  optional: GameSdkModuleId[];
};

const requiredModuleIdSet = new Set<GameSdkModuleId>([
  "authentication",
  "account-session",
  "authorization",
  "persistence",
  "observability",
  "common-navigation",
  "player-menu",
]);

export function classifyCreatorGameModules(
  profile: unknown,
): CreatorModuleClassification {
  const normalized = normalizeGameSdkModuleProfile(profile);
  const classification: CreatorModuleClassification = {
    required: [],
    removable: [],
    optional: [],
  };
  for (const definition of GAME_SDK_MODULE_CATALOG) {
    if (normalized[definition.id].mode === "disabled") {
      classification.optional.push(definition.id);
    } else if (requiredModuleIdSet.has(definition.id)) {
      classification.required.push(definition.id);
    } else {
      classification.removable.push(definition.id);
    }
  }
  return classification;
}
