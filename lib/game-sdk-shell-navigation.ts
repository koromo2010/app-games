export type GameSdkShellSurface = "lounge" | "lobby" | "playing" | "result";

export type GameSdkShellNavigationPlacement = {
  showDirectBack: boolean;
  showMenuBack: boolean;
};

export function gameSdkShellNavigationPlacement(
  surface: GameSdkShellSurface,
): GameSdkShellNavigationPlacement {
  return surface === "lounge"
    ? { showDirectBack: true, showMenuBack: false }
    : { showDirectBack: false, showMenuBack: true };
}
