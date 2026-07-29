"use client";

import {
  useCallback,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { GameSdkHttpClientRuntimeError } from "@game-fields/game-sdk/client-runtime";
import type { GameSdkModuleProfile } from "@game-fields/game-sdk/modules";
import { withAiActivity } from "@/lib/ai-activity-client";
import { shouldTrackGameSdkAiActivity } from "./game-sdk-frame-presentation";
import type {
  DebugWrappedCommand,
  GameSdkFrameRuntime,
  PackageRoom,
  SafeCommand,
} from "./game-sdk-frame-types";

type Options = {
  runtime: GameSdkFrameRuntime;
  roomRef: MutableRefObject<PackageRoom | null>;
  pendingActionRef: MutableRefObject<boolean>;
  setPending: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string>>;
  handleRuntimeError: (error: unknown) => void;
  attachRoom: (next: PackageRoom | null) => void;
  attachLatestRoom: (next: PackageRoom) => PackageRoom;
  usesLlm: boolean;
  moduleProfile: GameSdkModuleProfile;
  wrapDebugCommand: <TCommand extends { type: string }>(command: TCommand) => TCommand | DebugWrappedCommand<TCommand>;
};

/**
 * Command dispatch extracted out of GameSdkFrame.tsx: `run` (the generic
 * pending/error/PLAYER_ACTIVE_ROOM/STALE_REVISION-handling wrapper), `send`
 * (wraps `runtime.sendCommand` and conditionally routes through
 * `withAiActivity`), and `sendPackageCommand` (wraps `send` with the debug
 * actor substitution). Behavior is unchanged; the only difference from the
 * inline version is that the `usesLlm && moduleRequired("llm") &&
 * moduleRequired("ai-activity")` chain is now the pure, directly-testable
 * `shouldTrackGameSdkAiActivity` helper.
 */
export function useGameSdkCommandRunner({
  runtime,
  roomRef,
  pendingActionRef,
  setPending,
  setMessage,
  handleRuntimeError,
  attachRoom,
  attachLatestRoom,
  usesLlm,
  moduleProfile,
  wrapDebugCommand,
}: Options) {
  const run = useCallback(async (operation: () => Promise<PackageRoom>) => {
    if (pendingActionRef.current) return null;
    pendingActionRef.current = true;
    setPending(true);
    setMessage("");
    try {
      const next = await operation();
      return attachLatestRoom(next);
    } catch (error) {
      if (
        error instanceof GameSdkHttpClientRuntimeError
        && error.code === "PLAYER_ACTIVE_ROOM"
      ) {
        try {
          const activeRoom = await runtime.readActiveRoom();
          if (activeRoom) {
            attachRoom(activeRoom);
            setMessage("進行中の部屋へ戻りました。");
            return activeRoom;
          }
        } catch {
          // Fall through to the original lifecycle error.
        }
      }
      handleRuntimeError(error);
      if (
        error instanceof GameSdkHttpClientRuntimeError
        && error.code === "STALE_REVISION"
        && roomRef.current
      ) {
        const latest = await runtime.readRoom(roomRef.current.code);
        if (latest) attachLatestRoom(latest);
      }
      return null;
    } finally {
      pendingActionRef.current = false;
      setPending(false);
    }
  }, [attachLatestRoom, attachRoom, handleRuntimeError, pendingActionRef, roomRef, runtime, setMessage, setPending]);

  const send = useCallback(async (command: SafeCommand) => {
    const current = roomRef.current;
    if (!current) throw new Error("ROOM_REQUIRED");
    const operation = async () => (await runtime.sendCommand(current.code, {
      expectedRevision: current.revision,
      command,
    })).room;
    return shouldTrackGameSdkAiActivity({ usesLlm, moduleProfile })
      ? withAiActivity("SDKゲームのAI処理", operation)
      : operation();
  }, [moduleProfile, roomRef, runtime, usesLlm]);

  const sendPackageCommand = useCallback(async (command: SafeCommand) => (
    send(wrapDebugCommand(command))
  ), [send, wrapDebugCommand]);

  return useMemo(() => ({
    run,
    send,
    sendPackageCommand,
  }), [run, send, sendPackageCommand]);
}
