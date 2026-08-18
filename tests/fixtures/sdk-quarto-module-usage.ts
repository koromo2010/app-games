import {
  GAME_SDK_MODULE_CATALOG,
  GAME_SDK_PACKAGE_MODULE_IDS,
  type GameSdkModuleId,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";

const requiredIds: readonly GameSdkModuleId[] = [
  "start-guard",
  "phase-flow",
  "turn-order",
  "collect-choice",
  "standard-outcome",
] as const;

const disabledIds = GAME_SDK_PACKAGE_MODULE_IDS.filter(
  (id) => !requiredIds.includes(id),
);

export const QUARTO_DISABLED_MODULE_IDS = Object.freeze(disabledIds);
export const QUARTO_REQUIRED_MODULE_IDS = Object.freeze([...requiredIds]);

export const QUARTO_MODULE_PROFILE: GameSdkModuleProfile = Object.fromEntries(
  GAME_SDK_MODULE_CATALOG.map((definition) => [
    definition.id,
    disabledIds.includes(definition.id)
      ? { mode: "disabled", reason: "Quartoのゲーム進行では使用しないため" }
      : { mode: "required" },
  ]),
) as GameSdkModuleProfile;
