"use client";

import { useCallback, useRef, useState } from "react";
import {
  INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  beginGameSdkDebugControlSwitch,
  completeGameSdkDebugControlSwitch,
  gameSdkDebugControlCanSend,
  gameSdkDebugTargetActorSeat,
  gameSdkDebugTargetViewer,
  resetGameSdkDebugControl,
  wrapGameSdkDebugCommand,
  type GameSdkDebugControlState,
  type GameSdkDebugControlTarget,
  type GameSdkDebugViewer,
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
    void readRoomAsDebugViewer(room.code, viewer).then((debugRoom) => {
      const latest = stateRef.current;
      const latestRoom = getRoom();
      if (
        latest.generation !== generation
        || gameSdkDebugTargetViewer(latest.target) !== viewer
        || latestRoom?.code !== room.code
        || latestRoom.revision !== room.revision
      ) return;
      commit(completeGameSdkDebugControlSwitch(latest, generation));
      postRoomSnapshot(debugRoom);
    }).catch(() => {
      if (stateRef.current.generation !== generation) return;
      commit(resetGameSdkDebugControl(stateRef.current));
      postRoomSnapshot(getRoom());
      onViewerError();
    });
  }, [commit, getRoom, onViewerError, postRoomSnapshot, readRoomAsDebugViewer]);

  const selectTarget = useCallback((target: GameSdkDebugControlTarget) => {
    const room = getRoom();
    const next = commit(beginGameSdkDebugControlSwitch(stateRef.current, target));
    if (target.mode === "self") {
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
