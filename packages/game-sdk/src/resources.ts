import type { GameSdkContentSource } from "./content-source.js";
import type { GameSdkLlmGateway } from "./llm.js";

export type GameSdkPlatformResources = {
  contentSource?: GameSdkContentSource;
  llm?: GameSdkLlmGateway;
};

export type GameSdkResourceContext = {
  /**
   * Platform adapters available to this game. Cards and drawing are imported
   * directly from the SDK; privileged data/AI resources are injected here.
   */
  resources: Readonly<GameSdkPlatformResources>;
};

export function requireGameSdkContentSource(
  resources: Readonly<GameSdkPlatformResources>,
) {
  if (!resources.contentSource) {
    throw new Error("GAME_SDK_CONTENT_SOURCE_UNAVAILABLE");
  }
  return resources.contentSource;
}

export function requireGameSdkLlmGateway(
  resources: Readonly<GameSdkPlatformResources>,
) {
  if (!resources.llm) {
    throw new Error("GAME_SDK_LLM_UNAVAILABLE");
  }
  return resources.llm;
}
