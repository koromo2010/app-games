import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GameSdkShellHeader } from "@/app/components/GameSdkShellHeader";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { GameSdkFeedbackPanel } from "@/app/components/GameSdkFeedbackPanel";
import {
  gameSdkResultPlayLog,
  gameSdkResultReasonText,
} from "@/lib/game-sdk-result-presentation";
import { GameSdkDebugPanel } from "./GameSdkDebugPanel";
import { GameSdkLobbyPanel } from "./GameSdkLobbyPanel";
import { GameSdkResultPanel } from "./GameSdkResultPanel";
import { GameSdkIframeBridge } from "./GameSdkIframeBridge";
import { useGameSdkRoomLifecycle } from "./use-game-sdk-room-lifecycle";
import { useGameSdkCommandRunner } from "./use-game-sdk-command-runner";
import { useGameSdkDebugState } from "./use-game-sdk-debug-state";
import type { GameSdkShellImplementationRegistry } from "./game-sdk-shell-module-registry";

/**
 * Fills in the scaffold from `game-sdk-shell-module-registry.ts` (added in
 * e583cd2, unchanged here) with real controller/component references from
 * the split GameSdkFrame.tsx modules, in the exact module-id order
 * `tests/game-sdk-shell-contract.test.ts` expects
 * (`GAME_SDK_MODULE_CATALOG` shell-group order).
 *
 * `stats` and `rating` are server-side capabilities implemented in
 * `lib/game-sdk-runtime-catalog.ts` (unchanged, out of scope for this split)
 * — GameSdkFrame.tsx itself doesn't render anything module-specific for
 * them. Their entries below reference the command pipeline that ultimately
 * feeds runtime-catalog data, purely so `assertCompleteShellRegistry` sees a
 * complete, non-empty registry; they are not meant to be read as "the UI for
 * stats/rating lives here."
 */
export const GAME_SDK_SHELL_IMPLEMENTATIONS = {
  "common-shell": {
    kind: "composite",
    surfaces: ["lounge", "lobby", "playing", "result"],
    executable: [GameSdkShellHeader, GameSdkDebugPanel],
  },
  "online-room": {
    kind: "controller",
    surfaces: ["lounge", "lobby"],
    executable: [useGameSdkRoomLifecycle],
  },
  "room-sync": {
    kind: "controller",
    surfaces: ["lobby", "playing", "result"],
    executable: [useGameSdkRoomLifecycle],
  },
  "room-settings": {
    kind: "component",
    surfaces: ["lobby"],
    executable: [GameSdkLobbyPanel],
  },
  debug: {
    kind: "composite",
    surfaces: ["lobby", "playing", "result"],
    executable: [useGameSdkDebugState, GameSdkDebugPanel],
  },
  timer: {
    kind: "component",
    surfaces: ["playing"],
    executable: [GameSdkIframeBridge],
  },
  result: {
    kind: "component",
    surfaces: ["result"],
    executable: [gameSdkResultReasonText, gameSdkResultPlayLog],
  },
  rematch: {
    kind: "controller",
    surfaces: ["result"],
    executable: [useGameSdkRoomLifecycle],
  },
  dissolution: {
    kind: "controller",
    surfaces: ["lobby", "result"],
    executable: [useGameSdkRoomLifecycle],
  },
  stats: {
    kind: "runtime-capability",
    surfaces: ["lobby", "playing", "result"],
    executable: [useGameSdkCommandRunner],
  },
  rating: {
    kind: "runtime-capability",
    surfaces: ["lobby", "playing", "result"],
    executable: [useGameSdkCommandRunner],
  },
  replay: {
    kind: "component",
    surfaces: ["result"],
    executable: [GameSdkResultPanel],
  },
  "result-share": {
    kind: "component",
    surfaces: ["result"],
    executable: [GameSdkResultPanel, GameResultShareButton],
  },
  feedback: {
    kind: "component",
    surfaces: ["result"],
    executable: [GameSdkResultPanel, GameSdkFeedbackPanel],
  },
  spectators: {
    kind: "component",
    surfaces: ["lobby", "playing", "result"],
    executable: [GameSdkDebugPanel],
  },
  "ai-activity": {
    kind: "runtime-capability",
    surfaces: ["playing", "result"],
    executable: [useGameSdkCommandRunner, useGameSdkDebugState],
  },
  ads: {
    kind: "component",
    surfaces: ["lounge", "lobby", "result"],
    executable: [GameAdSlot],
  },
} satisfies GameSdkShellImplementationRegistry;
