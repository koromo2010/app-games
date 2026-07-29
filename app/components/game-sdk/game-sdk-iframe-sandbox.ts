"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { GameSdkHttpClientRuntimeError } from "@game-fields/game-sdk/client-runtime";
import type { GameSdkModuleProfile } from "@game-fields/game-sdk/modules";
import { useGameSdkDebugControlTarget } from "@/app/hooks/use-game-sdk-debug-control-target";
import { withAiActivity } from "@/lib/ai-activity-client";
import { shouldTrackGameSdkAiActivity } from "./game-sdk-frame-presentation";
import { appPhase } from "./game-sdk-frame-shared";
import type {
  DebugAutoProgressTarget,
  DebugViewer,
  GameSdkFrameRuntime,
  PackageRoom,
} from "./game-sdk-frame-types";

type Options = {
  roomRef: MutableRefObject<PackageRoom | null>;
  runtime: GameSdkFrameRuntime;
  moduleProfile: GameSdkModuleProfile;
  usesLlm: boolean;
  postRoomSnapshot: (room: PackageRoom | null) => void;
  setMessage: Dispatch<SetStateAction<string>>;
  pendingActionRef: MutableRefObject<boolean>;
  setPending: Dispatch<SetStateAction<boolean>>;
  handleRuntimeError: (error: unknown) => void;
};

/**
 * DEBUG viewer/actor selection, auto-progress and input-error simulation
 * extracted out of GameSdkFrame.tsx. Wraps the existing
 * `useGameSdkDebugControlTarget` hook (unchanged) and keeps `autoProgressDebug`
 * / `simulateDebugInputError` byte-for-byte equivalent to the pre-split
 * implementation.
 *
 * The auto-follow `useEffect` (which reacts to `room` — a value owned by
 * `useGameSdkRoomLifecycle`, which itself depends on this hook's
 * `resetDebugControl`/`postRoom` outputs) is wired one level up, in
 * `useGameSdkFrameController`, using the `selectDebugTarget` primitive
 * returned here. Splitting it this way avoids a circular hook dependency
 * while keeping the auto-follow behavior itself unchanged.
 *
 * (`app/components/game-sdk/use-game-sdk-debug-scenario.ts` mentioned in the
 * handoff doc does not exist at the split baseline — the actual generic
 * scenario runner lives at `app/hooks/use-game-sdk-debug-scenario.ts` and is
 * currently unused by GameSdkFrame.tsx. Swapping `autoProgressDebug`'s
 * hand-rolled loop for that generic runner would be a behavior change, not a
 * mechanical split, so it is intentionally left out of this refactor — see
 * the summary notes.)
 */
export function useGameSdkDebugState({
  roomRef,
  runtime,
  usesLlm,
  moduleProfile,
  postRoomSnapshot,
  setMessage,
  pendingActionRef,
  setPending,
  handleRuntimeError,
}: Options) {
  const [debugAutoFollow, setDebugAutoFollow] = useState(false);

  const debugControl = useGameSdkDebugControlTarget<PackageRoom>({
    getRoom: () => roomRef.current,
    readRoomAsDebugViewer: (code, viewer) => (
      runtime.readRoomAsDebugViewer(code, viewer)
    ),
    postRoomSnapshot,
    onViewerError: () => {
      setMessage("選択した閲覧視点を取得できないため、本人視点へ戻しました。");
    },
  });
  const {
    actorSeat: debugActorSeat,
    canSend: debugCanSend,
    postRoom,
    reset: resetDebugControl,
    selectTarget: selectDebugTarget,
    source: debugSwitchSource,
    viewer: debugViewer,
    wrapCommand: wrapDebugCommand,
  } = debugControl;

  const selectDebugViewer = useCallback((viewer: DebugViewer) => {
    selectDebugTarget(
      viewer === "self"
        ? { mode: "self" }
        : viewer === "spectator"
          ? { mode: "spectator" }
          : { mode: "viewer", seat: viewer },
    );
  }, [selectDebugTarget]);

  const selectDebugActor = useCallback((seat: number | null) => {
    if (seat !== null) {
      const target = roomRef.current?.view.common.players[seat];
      if (!target?.isDummy) {
        setMessage("操作対象にはダミープレイヤーだけを選択できます。");
        return;
      }
    }
    selectDebugTarget(seat === null ? { mode: "self" } : { mode: "dummy", seat });
  }, [roomRef, selectDebugTarget, setMessage]);

  const autoProgressDebug = useCallback(async (
    target: DebugAutoProgressTarget,
  ) => {
    const initial = roomRef.current;
    if (!initial) throw new Error("ROOM_REQUIRED");
    const initialOuterPhase = initial.phase;
    const initialAppPhase = appPhase(initial);
    const maximumSteps = target === "step"
      ? 1
      : target === "phase" && initialAppPhase !== null
        ? 64
        : target === "phase"
          ? 1
          : 160;
    const perform = async () => {
      let next = initial;
      for (let step = 0; step < maximumSteps; step += 1) {
        next = (await runtime.sendCommand(next.code, {
          expectedRevision: next.revision,
          command: { type: "room/debug-auto-progress" },
        })).room;
        if (
          target === "step"
          || (target === "result" && next.phase === "result")
          || (
            target === "phase"
            && (
              initialAppPhase === null
              || next.phase !== initialOuterPhase
              || appPhase(next) !== initialAppPhase
            )
          )
        ) {
          setMessage(
            target === "step"
              ? "DEBUG自動進行で1手進めました。"
              : target === "phase"
                ? initialAppPhase === null
                  ? "Appの状態名が非公開のため、安全に1手進めました。"
                  : `次の状態まで進めました（${appPhase(next) ?? next.phase}）。`
                : "DEBUG自動進行で結果まで完走しました。",
          );
          return next;
        }
      }
      throw new Error("DEBUG_AUTO_PROGRESS_LIMIT");
    };
    return shouldTrackGameSdkAiActivity({ usesLlm, moduleProfile })
      ? withAiActivity("SDKゲームのDEBUG自動進行", perform)
      : perform();
  }, [moduleProfile, roomRef, runtime, setMessage, usesLlm]);

  const simulateDebugInputError = useCallback(async () => {
    const current = roomRef.current;
    if (!current || pendingActionRef.current) return;
    pendingActionRef.current = true;
    setPending(true);
    setMessage("");
    try {
      await runtime.sendCommand(current.code, {
        expectedRevision: current.revision,
        command: { type: "room/debug-simulate-input-error" },
      });
      setMessage("入力エラーの拒否を再現できませんでした。");
    } catch (error) {
      if (
        error instanceof GameSdkHttpClientRuntimeError
        && error.code === "DEBUG_INPUT_ERROR_SIMULATED"
      ) {
        setMessage("不正入力がRoomを変更せず拒否されることを確認しました。");
      } else {
        handleRuntimeError(error);
      }
    } finally {
      pendingActionRef.current = false;
      setPending(false);
    }
  }, [handleRuntimeError, pendingActionRef, roomRef, runtime, setMessage, setPending]);

  return {
    debugActorSeat,
    debugAutoFollow,
    debugCanSend,
    debugSwitchSource,
    debugViewer,
    postRoom,
    resetDebugControl,
    selectDebugActor,
    selectDebugTarget,
    selectDebugViewer,
    setDebugAutoFollow,
    wrapDebugCommand,
    autoProgressDebug,
    simulateDebugInputError,
  };
}
