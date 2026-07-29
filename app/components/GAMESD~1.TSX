"use client";

import { useGameSdkFrameController } from "@/app/components/game-sdk/use-game-sdk-frame-controller";
import { GameSdkFrameView } from "@/app/components/game-sdk/GameSdkFrameView";
import type { GameSdkFrameProps } from "@/app/components/game-sdk/game-sdk-frame-types";

/**
 * Platform-owned GameFrame shared by candidate Preview and main.
 *
 * The immutable game package contributes only its sandboxed AppSet client
 * surface. Navigation, Room lifecycle, settings, results and Platform modules
 * remain identical in both channels.
 *
 * This component is now a thin composition of `useGameSdkFrameController`
 * (state/effects/side-effecting logic, split across
 * `app/components/game-sdk/use-game-sdk-room-lifecycle.ts`,
 * `use-game-sdk-command-runner.ts` and `use-game-sdk-debug-state.ts`) and
 * `GameSdkFrameView` (markup, split further into `GameSdkDebugPanel`,
 * `GameSdkLobbyPanel`, `GameSdkResultPanel` and `GameSdkIframeBridge`).
 * Behavior is unchanged from the pre-split ~600-line implementation.
 */
export function GameSdkFrame(props: GameSdkFrameProps) {
  const controller = useGameSdkFrameController(props);
  return <GameSdkFrameView {...controller.viewProps} />;
}
