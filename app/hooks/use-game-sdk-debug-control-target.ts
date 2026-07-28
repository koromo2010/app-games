"use client";

import { useCallback, useRef, useState } from "react";
import {
  INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  beginGameSdkDebugControlSwitch,
  beginGameSdkDebugViewerRequest,
  completeGameSdkDebugControlSwitch,
  completeGameSdkDebugViewerRequest,
  decideGameSdkDebugViewerResponse,
  gameSdkDebugControlCanSend,
  gameSdkDebugTargetActorSeat,
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

export function useGameSdkDebugControlTarget<TRoom extends RoomIdentity>({
  getRoom,
  readRoomAsDebugViewer,
  postRoomSnapshot,
  onViewerError,
}: Options<TRoom>) {
  const stateRef = useRef<GameSdkDebugControlState>(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  );
  const inFlightRef = useRef<GameSdkDebugViewerRequest | null>(null);
  const requestSequenceRef = useRef(0);
  const [state, setState] = useState<GameSdkDebugControlState>(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  );

  const commit = useCallback((next: GameSdkDebugControlState) => {
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const reset = useCallback(() => {
    const next = commit(resetGameSdkDebugControl(stateRef.current));
    inFlightRef.current = null;
    postRoomSnapshot(getRoom());
    return next;
  }, [commit, getRoom, postRoomSnapshot]);

  const postRoom = useCallback((room: TRoom | null) => {
    const current = stateRef.current;
    const viewer = gameSdkDebugTargetViewer(current.target);
    if (!room || viewer === "self") {
      postRoomSnapshot(room);
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
      void readRoomAsDebugViewer(requestedRoom.code, viewer).then((debugRoom) => {
        if (!gameSdkDebugViewerRequestIsCurrent(inFlightRef.current, request)) return;
        inFlightRef.current = completeGameSdkDebugViewerRequest(
          inFlightRef.current,
          request,
        );

        const latest = stateRef.current;
        const latestRoom = getRoom();
        const decision = decideGameSdkDebugViewerResponse({
          state: latest,
          generation,
          viewer,
          requestedRoom,
          latestRoom,
        });
        if (!decision.apply) return;

        commit(completeGameSdkDebugControlSwitch(latest, generation));
        postRoomSnapshot(debugRoom);
        if (decision.refetch && latestRoom) requestViewerRoom(latestRoom);
      }).catch(() => {
        if (!gameSdkDebugViewerRequestIsCurrent(inFlightRef.current, request)) return;
        inFlightRef.current = completeGameSdkDebugViewerRequest(
          inFlightRef.current,
          request,
        );
        if (stateRef.current.generation !== generation) return;
        commit(resetGameSdkDebugControl(stateRef.current));
        postRoomSnapshot(getRoom());
        onViewerError();
      });
    };

    requestViewerRoom(room);
  }, [commit, getRoom, onViewerError, postRoomSnapshot, readRoomAsDebugViewer]);

  const selectTarget = useCallback((target: GameSdkDebugControlTarget) => {
    const room = getRoom();
    const next = commit(beginGameSdkDebugControlSwitch(stateRef.current, target));
    if (target.mode === "self") {
      inFlightRef.current = null;
      postRoomSnapshot(room);
      return next;
    }
    if (room) postRoom(room);
    return next;
  }, [commit, getRoom, postRoom, postRoomSnapshot]);

  const wrapCommand = useCallback(<TCommand extends { type: string }>(
    command: TCommand,
  ) => wrapGameSdkDebugCommand(stateRef.current, command), []);

  return {
    actorSeat: gameSdkDebugTargetActorSeat(state),
    canSend: gameSdkDebugControlCanSend(state),
    isSwitching: state.status === "switching",
    postRoom,
    reset,
    selectTarget,
    state,
    viewer: gameSdkDebugTargetViewer(state.target),
    wrapCommand,
  };
}
