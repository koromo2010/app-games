"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { GameSdkModuleId } from "@game-fields/game-sdk/modules";
import {
  gameSdkRoomHasCommandResponseView,
  type GameSdkRoomWatch,
} from "@game-fields/game-sdk/client-runtime";
import { confirmRoomLeave } from "@/app/components/room-navigation-confirmation";
import { useGameSdkActiveRoomRestore } from "@/app/hooks/use-game-sdk-active-room-restore";
import { preferLatestOnlineRoom } from "@/lib/online-room-client-state";
import {
  roomUpdateIsOlder,
  roomUpdateIsUnchanged,
  sdkRoomViewHasReturningPlayer,
  shouldHoldRoomResultTransition,
  shouldKeepRoomResultAfterDissolve,
} from "@/lib/room-result-return";
import { shouldRestartGameSdkRoomWatch } from "./game-sdk-room-watch-policy";
import type { GameSdkFrameRuntime, PackageRoom } from "./game-sdk-frame-types";

type Options = {
  runtime: GameSdkFrameRuntime;
  previewOnly: boolean;
  moduleRequired: (id: GameSdkModuleId) => boolean;
  handleRuntimeError: (error: unknown) => void;
  roomRef: MutableRefObject<PackageRoom | null>;
  pendingActionRef: MutableRefObject<boolean>;
  setPending: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string>>;
  debugActorSeat: number | null;
  resetDebugControl: () => void;
  postRoom: (
    room: PackageRoom | null,
    options?: { viewerResolved?: boolean },
  ) => void;
  acceptPackageRevision: (room: PackageRoom) => boolean;
};

/**
 * Room acquisition, watch/sync, and lifecycle actions extracted out of
 * GameSdkFrame.tsx: attachRoom / attachLatestRoom / acceptIncomingRoom /
 * commitRoom / refreshRooms / loadActiveRoom / useGameSdkActiveRoomRestore /
 * joinRoomByCode's `runtime.readRoom`+`sendCommand` plumbing lives one level
 * up (see useGameSdkFrameController) because it needs `run` from
 * useGameSdkCommandRunner, which itself depends on attachLatestRoom exposed
 * here. dissolveRoom / leaveRoom / returnToRoom stay here since they only
 * need this hook's own state.
 */
export function useGameSdkRoomLifecycle({
  runtime,
  previewOnly,
  moduleRequired,
  handleRuntimeError,
  roomRef,
  pendingActionRef,
  setPending,
  setMessage,
  debugActorSeat,
  resetDebugControl,
  postRoom,
  acceptPackageRevision,
}: Options) {
  const watchRef = useRef<GameSdkRoomWatch | null>(null);
  const pendingLobbyRoomRef = useRef<PackageRoom | null>(null);

  const [room, setRoom] = useState<PackageRoom | null>(null);
  const [rooms, setRooms] = useState<Array<{
    code: string;
    playerCount: number;
    maximumPlayers: number;
  }>>([]);
  const [canReturnToRoom, setCanReturnToRoom] = useState(false);
  const [isRoomDissolved, setIsRoomDissolved] = useState(false);

  const commitRoom = useCallback((next: PackageRoom | null) => {
    if (next && !acceptPackageRevision(next)) return false;
    if (next?.phase !== "playing" && debugActorSeat !== null) {
      resetDebugControl();
    }
    roomRef.current = next;
    setRoom(next);
    postRoom(next, {
      viewerResolved: gameSdkRoomHasCommandResponseView(next),
    });
    return true;
  }, [acceptPackageRevision, debugActorSeat, postRoom, resetDebugControl, roomRef]);

  const acceptIncomingRoom = useCallback((next: PackageRoom | null) => {
    if (next && !acceptPackageRevision(next)) {
      watchRef.current?.close();
      watchRef.current = null;
      return;
    }
    const current = roomRef.current;
    if (next && current && current.code !== next.code) return;
    if (!next) {
      if (shouldKeepRoomResultAfterDissolve(current, "result")) {
        watchRef.current?.close();
        watchRef.current = null;
        pendingLobbyRoomRef.current = null;
        setCanReturnToRoom(false);
        setIsRoomDissolved(true);
        return;
      }
      commitRoom(null);
      return;
    }
    if (
      roomUpdateIsOlder(current, next)
      || roomUpdateIsUnchanged(current, next)
    ) return;
    if (shouldHoldRoomResultTransition(current, next, "result")) {
      if (!sdkRoomViewHasReturningPlayer(next)) {
        watchRef.current?.close();
        watchRef.current = null;
        pendingLobbyRoomRef.current = null;
        setCanReturnToRoom(false);
        setIsRoomDissolved(true);
        return;
      }
      pendingLobbyRoomRef.current = next;
      setCanReturnToRoom(true);
      return;
    }
    pendingLobbyRoomRef.current = null;
    setCanReturnToRoom(false);
    setIsRoomDissolved(false);
    commitRoom(next);
  }, [acceptPackageRevision, commitRoom, roomRef]);

  const attachRoom = useCallback((next: PackageRoom | null) => {
    if (next && !acceptPackageRevision(next)) return false;
    const previousCode = roomRef.current?.code;
    watchRef.current?.close();
    watchRef.current = null;
    if (!next || (previousCode && previousCode !== next.code)) {
      resetDebugControl();
    }
    if (!commitRoom(next)) return false;
    pendingLobbyRoomRef.current = null;
    setCanReturnToRoom(false);
    setIsRoomDissolved(false);
    if (!next || previewOnly) return true;
    watchRef.current = runtime.watchRoom(next.code, {
      onRoom: acceptIncomingRoom,
      onError: handleRuntimeError,
    });
    return true;
  }, [acceptIncomingRoom, acceptPackageRevision, commitRoom, handleRuntimeError, previewOnly, resetDebugControl, roomRef, runtime]);

  const attachLatestRoom = useCallback((next: PackageRoom) => {
    if (!acceptPackageRevision(next)) {
      throw new Error("GAME_SDK_PACKAGE_REVISION_MISMATCH");
    }
    if (gameSdkRoomHasCommandResponseView(next)) {
      watchRef.current?.acceptRevision(next.revision);
    }
    const current = roomRef.current;
    const accepted = preferLatestOnlineRoom(current, next);
    if (accepted === current) return current;
    if (
      previewOnly
      || !shouldRestartGameSdkRoomWatch(current?.code, accepted.code, Boolean(watchRef.current))
    ) {
      if (!commitRoom(accepted)) throw new Error("GAME_SDK_PACKAGE_REVISION_MISMATCH");
      pendingLobbyRoomRef.current = null;
      setCanReturnToRoom(false);
      setIsRoomDissolved(false);
      return accepted;
    }
    attachRoom(accepted);
    return accepted;
  }, [acceptPackageRevision, attachRoom, commitRoom, previewOnly, roomRef]);

  const refreshRooms = useCallback(async () => {
    if (previewOnly) {
      setRooms([]);
      return;
    }
    try {
      const page = await runtime.listRooms();
      setRooms(page.rooms);
    } catch (error) {
      handleRuntimeError(error);
    }
  }, [handleRuntimeError, previewOnly, runtime]);

  const loadActiveRoom = useCallback(
    () => previewOnly ? Promise.resolve(null) : runtime.readActiveRoom(),
    [previewOnly, runtime],
  );
  const handleRestoreError = useCallback((error: unknown) => {
    handleRuntimeError(error);
  }, [handleRuntimeError]);
  const isRestoringRoom = useGameSdkActiveRoomRestore({
    loadActiveRoom,
    onRoom: attachRoom,
    onEmpty: refreshRooms,
    onError: handleRestoreError,
  });

  useEffect(() => {
    return () => {
      watchRef.current?.close();
    };
  }, []);

  const returnToRoom = useCallback(async () => {
    const pendingLobbyRoom = pendingLobbyRoomRef.current;
    if (!pendingLobbyRoom || isRoomDissolved) return;
    try {
      const latestRoom = await runtime.readRoom(pendingLobbyRoom.code);
      if (
        !latestRoom
        || latestRoom.phase !== "lobby"
        || !sdkRoomViewHasReturningPlayer(latestRoom)
      ) {
        pendingLobbyRoomRef.current = null;
        setCanReturnToRoom(false);
        setIsRoomDissolved(true);
        setMessage("部屋が解散されたか、参加情報が変更されています。");
        return;
      }
      const selfSeat = latestRoom.view.common.players.find(
        (player) => player.isSelf,
      )?.seat;
      if (
        selfSeat === undefined
        || !latestRoom.view.common.pendingLobbyReturnSeats.includes(selfSeat)
      ) {
        attachLatestRoom(latestRoom);
        return;
      }
      const confirmed = await runtime.sendCommand(latestRoom.code, {
        expectedRevision: latestRoom.revision,
        command: { type: "room/confirm-lobby-return" },
      });
      attachLatestRoom(confirmed.room);
    } catch {
      setMessage("部屋へ戻れる状態を確認できませんでした。");
    }
  }, [attachLatestRoom, isRoomDissolved, runtime, setMessage]);

  const dissolveRoom = useCallback(async () => {
    const current = roomRef.current;
    if (
      !current
      || (current.phase !== "lobby" && current.phase !== "result")
      || pendingActionRef.current
      || !moduleRequired("dissolution")
      || !window.confirm("部屋を解散しますか？参加者はこの部屋に戻れなくなります。")
    ) return;
    pendingActionRef.current = true;
    setPending(true);
    setMessage("");
    try {
      const dissolved = await runtime.dissolveRoom(current.code);
      if (!dissolved) throw new Error("GAME_SDK_ROOM_DISSOLVE_FAILED");
      if (current.phase === "result") {
        watchRef.current?.close();
        watchRef.current = null;
        pendingLobbyRoomRef.current = null;
        setCanReturnToRoom(false);
        setIsRoomDissolved(true);
        setMessage("部屋を解散しました。結果画面はこのまま確認できます。");
      } else {
        attachRoom(null);
        setMessage("部屋を解散しました。新しい部屋を作成できます。");
      }
      await refreshRooms();
    } catch (error) {
      handleRuntimeError(error);
    } finally {
      pendingActionRef.current = false;
      setPending(false);
    }
  }, [attachRoom, handleRuntimeError, moduleRequired, pendingActionRef, refreshRooms, roomRef, runtime, setMessage, setPending]);

  const leaveRoom = useCallback(async () => {
    const current = roomRef.current;
    if (
      !current
      || current.phase !== "lobby"
      || current.view.common.isHost
      || pendingActionRef.current
      || !moduleRequired("online-room")
      || !confirmRoomLeave()
    ) return;
    pendingActionRef.current = true;
    setPending(true);
    setMessage("");
    try {
      await runtime.sendCommand(current.code, {
        expectedRevision: current.revision,
        command: { type: "room/leave" },
      });
      attachRoom(null);
      setMessage("部屋から退出しました。別の部屋へ参加できます。");
      await refreshRooms();
    } catch (error) {
      handleRuntimeError(error);
    } finally {
      pendingActionRef.current = false;
      setPending(false);
    }
  }, [attachRoom, handleRuntimeError, moduleRequired, pendingActionRef, refreshRooms, roomRef, runtime, setMessage, setPending]);

  return {
    room,
    rooms,
    canReturnToRoom,
    isRoomDissolved,
    isRestoringRoom,
    attachRoom,
    attachLatestRoom,
    commitRoom,
    refreshRooms,
    dissolveRoom,
    leaveRoom,
    returnToRoom,
  };
}
