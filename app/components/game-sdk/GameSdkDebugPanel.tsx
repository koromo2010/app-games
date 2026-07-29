"use client";

import type { ReactNode } from "react";
import { GameSdkShellHeader } from "@/app/components/GameSdkShellHeader";
import type { GameSdkShellSurface } from "@/lib/game-sdk-shell-navigation";
import type { GameSdkModuleId } from "@game-fields/game-sdk/modules";
import { buildGameSdkDebugRoom } from "./game-sdk-frame-presentation";
import type {
  CommonView,
  DebugAutoProgressTarget,
  DebugViewer,
  PackageRoom,
  SafeCommand,
} from "./game-sdk-frame-types";

type Props = {
  eyebrow: string;
  title: string;
  rules: readonly string[];
  backHref: string;
  backLabel: string;
  surface: GameSdkShellSurface;
  children?: ReactNode;
  room: PackageRoom;
  common: CommonView | undefined;
  moduleRequired: (id: GameSdkModuleId) => boolean;
  supportsSpectators: boolean;
  debugAutoFollow: boolean;
  debugOwnerSeat: number | null | undefined;
  debugActorSeat: number | null;
  debugViewer: DebugViewer;
  debugSwitchSource: "manual" | "auto-follow" | "reset";
  pending: boolean;
  message: string;
  run: (operation: () => Promise<PackageRoom>) => Promise<PackageRoom | null>;
  send: (command: SafeCommand) => Promise<PackageRoom>;
  autoProgressDebug: (target: DebugAutoProgressTarget) => Promise<PackageRoom>;
  simulateDebugInputError: () => Promise<void>;
  onToggleAutoFollow: (enabled: boolean) => void;
  onSelectActor: (seat: number | null) => void;
  onSelectViewer: (viewer: DebugViewer) => void;
};

/**
 * Header + DEBUG wiring extracted out of GameSdkFrame.tsx: this is the piece
 * that used to build the `debugRoom={...}` object literal passed to
 * `GameSdkShellHeader` in the "room exists" branch of the render. The lounge
 * (no-room) header is simple enough that GameSdkFrameView renders
 * `GameSdkShellHeader` directly for it.
 *
 * The actual `debugRoom` construction lives in the pure, directly-testable
 * `buildGameSdkDebugRoom` (see game-sdk-frame-presentation.ts) so
 * `tests/game-sdk-shell-contract.test.ts` can assert on it — and invoke its
 * handlers against a mock runtime — without needing a React renderer.
 * `GameSdkShellHeader.tsx` itself is unchanged.
 */
export function GameSdkDebugPanel({
  eyebrow,
  title,
  rules,
  backHref,
  backLabel,
  surface,
  children,
  room,
  common,
  moduleRequired,
  supportsSpectators,
  debugAutoFollow,
  debugOwnerSeat,
  debugActorSeat,
  debugViewer,
  debugSwitchSource,
  pending,
  message,
  run,
  send,
  autoProgressDebug,
  simulateDebugInputError,
  onToggleAutoFollow,
  onSelectActor,
  onSelectViewer,
}: Props) {
  const debugRoom = buildGameSdkDebugRoom({
    room,
    common,
    moduleRequired,
    supportsSpectators,
    debugAutoFollow,
    debugOwnerSeat,
    debugActorSeat,
    debugViewer,
    debugSwitchSource,
    pending,
    message,
    run,
    send,
    autoProgressDebug,
    simulateDebugInputError,
    onToggleAutoFollow,
    onSelectActor,
    onSelectViewer,
  });

  return (
    <GameSdkShellHeader
      eyebrow={eyebrow}
      title={title}
      rules={rules}
      backHref={backHref}
      backLabel={backLabel}
      surface={surface}
      debugRoom={debugRoom}
    >
      {children}
    </GameSdkShellHeader>
  );
}
