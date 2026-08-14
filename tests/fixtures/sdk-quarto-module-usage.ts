import {
  GAME_SDK_MODULE_CATALOG,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";

const disabledIds = GAME_SDK_MODULE_CATALOG
  .filter((definition) => definition.group !== "platform")
  .slice(0, 14)
  .map((definition) => definition.id);

export const QUARTO_DISABLED_MODULE_IDS = Object.freeze(disabledIds);
export const QUARTO_REQUIRED_MODULE_IDS = Object.freeze(
  GAME_SDK_MODULE_CATALOG
    .map((definition) => definition.id)
    .filter((id) => !disabledIds.includes(id)),
);

export const QUARTO_MODULE_PROFILE: GameSdkModuleProfile = Object.fromEntries(
  GAME_SDK_MODULE_CATALOG.map((definition) => [
    definition.id,
    disabledIds.includes(definition.id)
      ? { mode: "disabled", reason: "Quartoのゲーム進行では使用しないため" }
      : { mode: "required" },
  ]),
) as GameSdkModuleProfile;
