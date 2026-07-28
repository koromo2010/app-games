"use client";

import { useCallback, useRef, useState } from "react";
import {
  INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  beginGameSdkDebugControlSwitch,
  beginGameSdkDebugViewerRequest,
  completeGameSdkDebugControlSwitch,
  completeGameSdkDebugViewerRequest,
  decideGameSdkDebugViewerResponse,
  gameSdkDebugControlCanDispatch,
  gameSdkDebugSelectedActorSeat,
  gameSdkDebugTargetViewer,
  gameSdkDebugViewerRequestIsCurrent,
  resetGameSdkDebugControl,
  wrapGameSdkDebugCommand,
  type GameSdkDebugControlState,
  type GameSdkDebugControlTarget,
  type GameSdkDebugViewer,
  type GameSdkDebugViewerRequest,
} from "@/lib/game-sdk-debug-control-target";

type RoomIdentity = {
  code: string;
  revision: number;
};

type Options<TRoom extends RoomIdentity> = {
  getRoom(): TRoom | null;
  readRoomAsDebugViewer(
    code: string,
    viewer: Exclude<GameSdkDebugViewer, "self">,
  ): Promise<TRoom | null>;
  postRoomSnapshot(room: TRoom | null): void;
  onViewerError(): void;
};

const DEBUG_VIEWER_RETRY_DELAYS_MS = [500, 1_000, 2_000, 5_000] as const;

export function useGameSdkDebugControlTarget<TRoom extends RoomIdentity>(
  options: Options<TRoom>,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stateRef = useRef<GameSdkDebugControlState>(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  );
  const inFlightRef = useRef<GameSdkDebugViewerRequest | null>(null);
  const requestSequenceRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const [state, setState] = useState<GameSdkDebugControlState>(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  );

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryAttemptRef.current = 0;
  }, []);

  const commit = useCallback((next: GameSdkDebugControlState) => {
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const reset = useCallback(() => {
    clearRetry();
    const next = commit(resetGameSdkDebugControl(stateRef.current));
    inFlightRef.current = null;
    optionsRef.current.postRoomSnapshot(optionsRef.current.getRoom());
    return next;
  }, [clearRetry, commit]);

  const postRoom = useCallback((room: TRoom | null) => {
    const current = stateRef.current;
    const viewer = gameSdkDebugTargetViewer(current.target);
    if (!room || viewer === "self") {
      optionsRef.current.postRoomSnapshot(room);
      return;
    }

    const generation = current.generation;
    const requestViewerRoom = (requestedRoom: TRoom) => {
      requestSequenceRef.current += 1;
      const acquisition = beginGameSdkDebugViewerRequest(
        inFlightRef.current,
        generation,
        requestSequenceRef.current,
      );
      if (!acquisition.started) return;

      const request = acquisition.request;
      inFlightRef.current = request;
      void optionsRef.current.readRoomAsDebugViewer(requestedRoom.code, viewer).then((debugRoom) => {
        if (!gameSdkDebugViewerRequestIsCurrent(inFlightRef.current, request)) return;
        inFlightRef.current = completeGameSdkDebugViewerRequest(
          inFlightRef.current,
          request,
        );

        const latest = stateRef.current;
        const latestRoom = optionsRef.current.getRoom();
        const decision = decideGameSdkDebugViewerResponse({
          state: latest,
          generation,
          viewer,
          requestedRoom,
          latestRoom,
        });
        if (!decision.apply) return;

        clearRetry();
        commit(completeGameSdkDebugControlSwitch(latest, generation));
        optionsRef.current.postRoomSnapshot(debugRoom);
        if (decision.refetch && latestRoom) requestViewerRoom(latestRoom);
      }).catch(() => {
        if (!gameSdkDebugViewerRequestIsCurrent(inFlightRef.current, request)) return;
        inFlightRef.current = completeGameSdkDebugViewerRequest(
          inFlightRef.current,
          request,
        );

        const latest = stateRef.current;
        const latestRoom = optionsRef.current.getRoom();
        if (
          latest.generation !== generation
          || gameSdkDebugTargetViewer(latest.target) !== viewer
          || !latestRoom
          || latestRoom.code !== requestedRoom.code
        ) return;

        const retryIndex = Math.min(
          retryAttemptRef.current,
          DEBUG_VIEWER_RETRY_DELAYS_MS.length - 1,
        );
        const retryDelay = DEBUG_VIEWER_RETRY_DELAYS_MS[retryIndex]!;
        retryAttemptRef.current += 1;
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          const retryRoom = optionsRef.current.getRoom();
          const retryState = stateRef.current;
          if (
            retryState.generation === generation
            && gameSdkDebugTargetViewer(retryState.target) === viewer
            && retryRoom?.code === requestedRoom.code
          ) {
            requestViewerRoom(retryRoom);
          }
        }, retryDelay);
      });
    };

    requestViewerRoom(room);
  }, [clearRetry, commit]);

  const selectTarget = useCallback((target: GameSdkDebugControlTarget) => {
    clearRetry();
    const room = optionsRef.current.getRoom();
    const next = commit(beginGameSdkDebugControlSwitch(stateRef.current, target));
    if (target.mode === "self") {
      inFlightRef.current = null;
      optionsRef.current.postRoomSnapshot(room);
      return next;
    }
    if (room) postRoom(room);
    return next;
  }, [clearRetry, commit, postRoom]);

  const wrapCommand = useCallback(<TCommand extends { type: string }>(
    command: TCommand,
  ) => wrapGameSdkDebugCommand(stateRef.current, command), []);

  return {
    actorSeat: gameSdkDebugSelectedActorSeat(state),
    canSend: gameSdkDebugControlCanDispatch(state),
    isSwitching: state.status === "switching",
    postRoom,
    reset,
    selectTarget,
    state,
    viewer: gameSdkDebugTargetViewer(state.target),
    wrapCommand,
  };
}
