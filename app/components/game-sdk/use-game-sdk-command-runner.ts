"use client";

import {
  useCallback,
  useMemo,
  useRef,
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
  DebugViewer,
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
  attachRoom: (next: PackageRoom | null) => boolean;
  attachLatestRoom: (next: PackageRoom) => PackageRoom;
  usesLlm: boolean;
  moduleProfile: GameSdkModuleProfile;
  wrapDebugCommand: <TCommand extends { type: string }>(command: TCommand) => TCommand | DebugWrappedCommand<TCommand>;
  debugViewer: DebugViewer;
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
  debugViewer,
}: Options) {
  const attemptedTimerExpiryRef = useRef(new Set<string>());

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
          if (activeRoom && attachRoom(activeRoom)) {
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

    const isTimerExpiry = command.type === "room/expire-timer"
      && "turnSequence" in command
      && Number.isSafeInteger(command.turnSequence);
    const turnSequence = isTimerExpiry ? Number(command.turnSequence) : null;
    const expiryKey = turnSequence === null ? null : `${current.code}:${turnSequence}`;

    if (expiryKey) {
      if (attemptedTimerExpiryRef.current.has(expiryKey)) return current;
      attemptedTimerExpiryRef.current.add(expiryKey);
      if (attemptedTimerExpiryRef.current.size > 64) {
        attemptedTimerExpiryRef.current = new Set([expiryKey]);
      }
    }

    const dispatch = async (room: PackageRoom) => (await runtime.sendCommand(room.code, {
      expectedRevision: room.revision,
      command,
    }, {
      finalViewer: debugViewer,
    })).room;
    const operation = () => dispatch(current);

    try {
      return shouldTrackGameSdkAiActivity({ usesLlm, moduleProfile })
        ? await withAiActivity("SDKゲームのAI処理", operation)
        : await operation();
    } catch (error) {
      if (
        expiryKey
        && turnSequence !== null
        && error instanceof GameSdkHttpClientRuntimeError
        && error.code === "STALE_REVISION"
      ) {
        const latest = await runtime.readRoom(current.code);
        if (latest) {
          attachLatestRoom(latest);
          const latestTimer = latest.view.common.timer;
          if (
            latest.phase !== "result"
            && latestTimer?.turnSequence === turnSequence
            && latestTimer.deadlineAt !== null
            && Date.now() >= latestTimer.deadlineAt
          ) {
            return dispatch(latest);
          }
          return latest;
        }
      }
      throw error;
    }
  }, [attachLatestRoom, debugViewer, moduleProfile, roomRef, runtime, usesLlm]);

  const sendPackageCommand = useCallback(async (command: SafeCommand) => (
    send(wrapDebugCommand(command))
  ), [send, wrapDebugCommand]);

  return useMemo(() => ({
    run,
    send,
    sendPackageCommand,
  }), [run, send, sendPackageCommand]);
}
