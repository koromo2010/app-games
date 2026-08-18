import type { ComponentType } from "react";
import { GAME_SDK_MODULE_CATALOG, type GameSdkModuleId } from "@game-fields/game-sdk/modules";

export type GameSdkShellSurface = "lounge" | "lobby" | "playing" | "result";

export type GameSdkShellImplementation = {
  kind: "component" | "controller" | "composite" | "runtime-capability";
  surfaces: readonly GameSdkShellSurface[];
  executable: readonly unknown[];
};

export type GameSdkShellImplementationRegistry = Record<string, GameSdkShellImplementation>;

export function shellModuleIds(): GameSdkModuleId[] {
  return GAME_SDK_MODULE_CATALOG
    .filter((definition) => definition.group === "shell")
    .map((definition) => definition.id);
}

export function assertCompleteShellRegistry(
  registry: GameSdkShellImplementationRegistry,
): void {
  const expected = shellModuleIds();
  const actual = Object.keys(registry);
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
    throw new Error("GAME_SDK_SHELL_REGISTRY_INCOMPLETE");
  }
  for (const id of expected) {
    const implementation = registry[id];
    if (!implementation || implementation.executable.length === 0 || implementation.surfaces.length === 0) {
      throw new Error("GAME_SDK_SHELL_IMPLEMENTATION_MISSING");
    }
  }
}

export function componentEvidence(component: ComponentType<unknown>): unknown {
  return component;
}
