import type { GameSdkManifest } from "@game-fields/game-sdk";
import {
  normalizeGameSdkModuleProfile,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";

export function gameSdkPlatformResourcePolicy(
  manifest: Pick<GameSdkManifest, "usesLlm">,
  moduleProfileInput: unknown,
) {
  const moduleProfile = normalizeGameSdkModuleProfile(moduleProfileInput);
  return {
    moduleProfile,
    contentSource: moduleProfile["content-source"].mode === "required",
    llm: manifest.usesLlm && moduleProfile.llm.mode === "required",
    feedback: (
      manifest.usesLlm
      && moduleProfile.llm.mode === "required"
      && moduleProfile.feedback.mode === "required"
    ),
  } satisfies {
    moduleProfile: GameSdkModuleProfile;
    contentSource: boolean;
    llm: boolean;
    feedback: boolean;
  };
}
