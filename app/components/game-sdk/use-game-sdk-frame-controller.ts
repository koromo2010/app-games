"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GameSdkSettingValue } from "@game-fields/game-sdk";
import {
  normalizeGameSdkModuleProfile,
  type GameSdkModuleId,
} from "@game-fields/game-sdk/modules";
import {
  createGameSdkHttpClientRuntime,
  gameSdkCommandTimingForRoom,
  GameSdkHttpClientRuntimeError,
} from "@game-fields/game-sdk/client-runtime";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { useSdkPreviewSessionRequired } from "@/app/sdk-preview/SdkPreviewSessionGate";
import { clearPlayerSession } from "@/lib/player-session";
import { gameSdkDebugAutoFollowTarget } from "@/lib/game-sdk-debug-control-target";
import {
  gameSdkPackageRevisionHref,
  gameSdkPackageRevisionIssue,
  type GameSdkPackageRevisionIssue,
} from "@/lib/game-sdk-package-revision";
import {
  gameSdkResultPlayLog,
  gameSdkResultReasonText,
} from "@/lib/game-sdk-result-presentation";
import { errorMessage, randomRoomCode } from "./game-sdk-frame-shared";
import { buildGameSdkShareText } from "./game-sdk-frame-presentation";
import { useGameSdkDebugState } from "./use-game-sdk-debug-state";
import { useGameSdkRoomLifecycle } from "./use-game-sdk-room-lifecycle";
import { useGameSdkCommandRunner } from "./use-game-sdk-command-runner";
import type {
  GameSdkFrameProps,
  PackageRoom,
  PackageRoomView,
  SafeCommand,
} from "./game-sdk-frame-types";
import type { GameSdkFrameViewProps } from "./GameSdkFrameView";

export function useGameSdkFrameController(
  props: GameSdkFrameProps,
): { viewProps: GameSdkFrameViewProps } {
  const {
    backHref,
    creatorSlug,
    endpoint: endpointInput,
    gameId,
    packageRevision,
    runtimeId,
    runtimeUrl,
    title,
    settingDefinitions,
    rules,
    moduleProfile,
    supportsReplay,
    supportsSpectators,
    usesLlm,
    previewOnly = false,
  } = props;

  const { locale } = useAppLocale();
  const requirePreviewSession = useSdkPreviewSessionRequired();
  const [playerAuthRequired, setPlayerAuthRequired] = useState(false);
  const endpoint = endpointInput
    ?? `/api/sdk-preview/${creatorSlug}/games/${gameId}/rooms`;
  const runtime = useMemo(() => createGameSdkHttpClientRuntime<
    { settings?: Record<string, GameSdkSettingValue>; app: Record<string, never> },
    SafeCommand,
    PackageRoomView
  >({
    gameId: runtimeId,
    endpoint,
  }), [endpoint, runtimeId]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const roomRef = useRef<PackageRoom | null>(null);
  const pendingActionRef = useRef(false);
  const expiryRef = useRef<number | null>(null);
  const lastAutoFollowOwnerSeatRef = useRef<number | null | undefined>(undefined);

  const [joinCode, setJoinCode] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [packageRevisionIssue, setPackageRevisionIssue] =
    useState<GameSdkPackageRevisionIssue | null>(null);
  const [playerDefaults, setPlayerDefaults] = useState<
    Record<string, GameSdkSettingValue>
  >({});

  const runtimeModuleProfile = useMemo(
    () => normalizeGameSdkModuleProfile(moduleProfile),
    [moduleProfile],
  );

  const moduleRequired = useCallback((id: GameSdkModuleId) => (
    runtimeModuleProfile[id].mode === "required"
  ), [runtimeModuleProfile]);

  const handleRuntimeError = useCallback((error: unknown) => {
    if (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 401
    ) {
      if (creatorSlug) {
        requirePreviewSession();
      } else {
        clearPlayerSession();
        setPlayerAuthRequired(true);
      }
    }
    if (
      error instanceof GameSdkHttpClientRuntimeError
      && (
        error.code === "ROOM_RUNTIME_MISMATCH"
        || error.code === "SDK_PREVIEW_PACKAGE_NOT_AVAILABLE"
        || error.code === "GAME_SDK_RUNTIME_CATALOG_UNAVAILABLE"
      )
    ) {
      setPackageRevisionIssue({
        kind: "unknown",
        requestedRevision: packageRevision,
        roomCode: "UNKNOWN",
        roomRevision: null,
      });
    }
    setMessage(errorMessage(error, Boolean(creatorSlug)));
  }, [creatorSlug, packageRevision, requirePreviewSession]);

  const defaultsEndpoint = creatorSlug
    ? `/api/sdk-preview/${creatorSlug}/games/${gameId}/defaults`
    : `/api/game-sdk/${gameId}/defaults`;

  useEffect(() => {
    if (previewOnly || !moduleRequired("room-settings")) return;
    let active = true;
    void fetch(defaultsEndpoint, {
      cache: "no-store",
      credentials: "same-origin",
    }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as {
        settings?: Record<string, GameSdkSettingValue>;
      };
      if (active) setPlayerDefaults(body.settings ?? {});
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [defaultsEndpoint, moduleRequired, previewOnly]);

  const postRoomSnapshot = useCallback((next: PackageRoom | null) => {
    const timing = gameSdkCommandTimingForRoom(next);
    iframeRef.current?.contentWindow?.postMessage({
      type: "game-fields:room-snapshot",
      room: next,
      ...(timing ? {
        timing: {
          requestRef: timing.requestRef,
          traceRef: timing.traceRef,
          revision: timing.revision,
        },
      } : {}),
    }, "*");
  }, []);

  const acceptPackageRevision = useCallback((next: PackageRoom) => {
    const issue = gameSdkPackageRevisionIssue(packageRevision, next);
    if (issue) {
      setPackageRevisionIssue(issue);
      setMessage(issue.kind === "mismatch"
        ? "Room固定revisionとURL指定revisionが異なるため、自動復帰を停止しました。"
        : "Room固定revisionを取得できないため、clientの読込を停止しました。");
      return false;
    }
    setPackageRevisionIssue(null);
    return true;
  }, [packageRevision]);

  const debugState = useGameSdkDebugState({
    roomRef,
    runtime,
    usesLlm,
    moduleProfile: runtimeModuleProfile,
    postRoomSnapshot,
    setMessage,
    pendingActionRef,
    setPending,
    handleRuntimeError,
  });

  const lifecycle = useGameSdkRoomLifecycle({
    runtime,
    previewOnly,
    moduleRequired,
    handleRuntimeError,
    roomRef,
    pendingActionRef,
    setPending,
    setMessage,
    debugActorSeat: debugState.debugActorSeat,
    resetDebugControl: debugState.resetDebugControl,
    postRoom: debugState.postRoom,
    acceptPackageRevision,
  });

  const commandRunner = useGameSdkCommandRunner({
    runtime,
    roomRef,
    pendingActionRef,
    setPending,
    setMessage,
    handleRuntimeError,
    attachRoom: lifecycle.attachRoom,
    attachLatestRoom: lifecycle.attachLatestRoom,
    usesLlm,
    moduleProfile: runtimeModuleProfile,
    wrapDebugCommand: debugState.wrapDebugCommand,
    debugViewer: debugState.debugViewer,
  });

  const { room, refreshRooms } = lifecycle;
  const { selectDebugTarget, debugAutoFollow } = debugState;
  const debugOwnerSeat = room?.view.common.timer?.ownerSeat;
  useEffect(() => {
    if (!debugAutoFollow) {
      lastAutoFollowOwnerSeatRef.current = undefined;
      return;
    }
    if (debugOwnerSeat === null || debugOwnerSeat === undefined) return;
    if (lastAutoFollowOwnerSeatRef.current === debugOwnerSeat) return;
    lastAutoFollowOwnerSeatRef.current = debugOwnerSeat;
    const currentPlayers = roomRef.current?.view.common.players ?? [];
    const target = gameSdkDebugAutoFollowTarget(debugOwnerSeat, currentPlayers);
    if (!target) return;
    selectDebugTarget(target, "auto-follow");
  }, [debugAutoFollow, debugOwnerSeat, selectDebugTarget]);

  useEffect(() => {
    if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    expiryRef.current = null;
    const timer = room?.view.common.timer;
    if (
      !moduleRequired("timer")
      || !room
      || room.phase === "result"
      || !timer?.deadlineAt
    ) return;
    expiryRef.current = window.setTimeout(() => {
      void commandRunner.send({
        type: "room/expire-timer",
        turnSequence: timer.turnSequence,
      }).then(lifecycle.attachLatestRoom).catch(() => undefined);
    }, Math.max(0, timer.deadlineAt + 1_500 - Date.now()));
    return () => {
      if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    };
  }, [commandRunner, lifecycle.attachLatestRoom, moduleRequired, room]);

  const joinRoomByCode = useCallback((code: string) => commandRunner.run(async () => {
    const target = await runtime.readRoom(code);
    if (!target) throw new Error("ROOM_NOT_FOUND");
    if (!acceptPackageRevision(target)) {
      throw new Error("GAME_SDK_PACKAGE_REVISION_MISMATCH");
    }
    return (await runtime.sendCommand(target.code, {
      expectedRevision: target.revision,
      command: { type: "room/join" },
    })).room;
  }), [acceptPackageRevision, commandRunner, runtime]);

  const defaultSettings = useMemo(() => Object.fromEntries(
    settingDefinitions.map((definition) => [
      definition.key,
      playerDefaults[definition.key] ?? definition.defaultValue,
    ]),
  ), [playerDefaults, settingDefinitions]);

  const common = room?.view.common;
  const self = common?.players.find((player) => player.isSelf);
  const timer = common?.timer;
  const standardResult = common?.standardResult;
  const resultReason = standardResult
    ? gameSdkResultReasonText(standardResult, locale)
    : "";
  const resultPlayLog = standardResult
    ? gameSdkResultPlayLog(standardResult, locale)
    : [];
  const resultShareText = buildGameSdkShareText({
    phase: room?.phase ?? "",
    title,
    locale,
    playerCount: common?.players.length ?? 0,
    result: standardResult,
  });
  const feedbackEndpoint = creatorSlug
    ? `/api/sdk-preview/${creatorSlug}/games/${gameId}/feedback`
    : `/api/game-sdk/${gameId}/feedback`;

  const onPlayerAuthenticated = useCallback(() => {
    setPlayerAuthRequired(false);
    void refreshRooms();
  }, [refreshRooms]);

  const onCreateRoom = useCallback(() => {
    void commandRunner.run(() => runtime.createRoom({
      roomCode: randomRoomCode(),
      create: { settings: defaultSettings, app: {} },
    }));
  }, [commandRunner, defaultSettings, runtime]);

  const previewCreateStartedRef = useRef(false);
  useEffect(() => {
    if (
      !previewOnly
      || previewCreateStartedRef.current
      || lifecycle.isRestoringRoom
      || lifecycle.room
      || pending
    ) return;
    previewCreateStartedRef.current = true;
    onCreateRoom();
  }, [lifecycle.isRestoringRoom, lifecycle.room, onCreateRoom, pending, previewOnly]);

  const onResumePinnedRoom = useCallback(() => {
    if (packageRevisionIssue?.kind !== "mismatch") return;
    try {
      window.location.assign(gameSdkPackageRevisionHref(
        window.location.href,
        packageRevisionIssue.roomRevision,
      ));
    } catch {
      setMessage(
        "Room固定revisionのURLを作成できませんでした。別revisionへは切り替えていません。",
      );
    }
  }, [packageRevisionIssue]);

  const onCreateRequestedRoom = useCallback(() => {
    if (packageRevisionIssue?.kind !== "mismatch") return;
    void commandRunner.run(() => runtime.createRoom({
      roomCode: randomRoomCode(),
      create: { settings: defaultSettings, app: {} },
      replaceActiveRoom: {
        code: packageRevisionIssue.roomCode,
        packageRevision: packageRevisionIssue.roomRevision,
      },
    }));
  }, [
    commandRunner,
    defaultSettings,
    packageRevisionIssue,
    runtime,
  ]);

  const onStart = useCallback(() => {
    void commandRunner.run(() => commandRunner.send({ type: "game/start" }));
  }, [commandRunner]);

  const onAbort = useCallback(() => {
    void commandRunner.run(() => commandRunner.send({ type: "room/abort" }));
  }, [commandRunner]);

  const onRecoverTimeout = useCallback(() => {
    void commandRunner.run(() => commandRunner.send({ type: "room/recover-timeout" }));
  }, [commandRunner]);

  const onSaveDefaults = useCallback((settings: Record<string, GameSdkSettingValue>) => {
    setPlayerDefaults(settings);
  }, []);

  const onReturnToRoom = !previewOnly
    && room
    && room.phase === "result"
    && moduleRequired("rematch")
    ? (common?.isHost
      ? () => {
        void commandRunner.run(() => commandRunner.send({ type: "room/rematch" }));
      }
      : lifecycle.returnToRoom)
    : undefined;
  const onDissolve = !previewOnly
    && moduleRequired("dissolution")
    && room
    && (room.phase === "lobby" || room.phase === "result")
    ? lifecycle.dissolveRoom
    : undefined;
  const onLeave = !previewOnly
    && moduleRequired("online-room")
    && room?.phase === "lobby"
    && common?.isHost === false
    ? lifecycle.leaveRoom
    : undefined;

  return {
    viewProps: {
      playerAuthRequired,
      onPlayerAuthenticated,
      title,
      gameId,
      backHref,
      creatorSlug,
      packageRevision,
      previewOnly,
      rules,
      room,
      roomRef,
      iframeRef,
      runtimeUrl,
      packageRevisionIssue,
      onResumePinnedRoom,
      onCreateRequestedRoom,
      moduleRequired,
      pending,
      message,
      isRestoringRoom: lifecycle.isRestoringRoom,
      joinCode,
      setJoinCode,
      rooms: lifecycle.rooms,
      onCreateRoom,
      onJoinRoomByCode: joinRoomByCode,
      onRefreshRooms: () => void refreshRooms(),
      common,
      supportsReplay,
      supportsSpectators,
      usesLlm,
      reducedTime: self?.reducedTime,
      timer,
      remainingSeconds: null,
      standardResult,
      resultReason,
      resultPlayLog,
      resultShareText,
      canReturnToRoom: lifecycle.canReturnToRoom,
      isRoomDissolved: lifecycle.isRoomDissolved,
      onReturnToRoom,
      onDissolve,
      onLeave,
      onStart,
      onAbort,
      onRecoverTimeout,
      settingDefinitions,
      defaultsEndpoint,
      onSaveDefaults,
      feedbackEndpoint,
      debugAutoFollow: debugState.debugAutoFollow,
      debugOwnerSeat,
      debugActorSeat: debugState.debugActorSeat,
      debugViewer: debugState.debugViewer,
      debugSwitchSource: debugState.debugSwitchSource,
      debugCanSend: debugState.debugCanSend,
      postRoom: debugState.postRoom,
      run: commandRunner.run,
      send: commandRunner.send,
      sendPackageCommand: commandRunner.sendPackageCommand,
      attachLatestRoom: lifecycle.attachLatestRoom,
      autoProgressDebug: debugState.autoProgressDebug,
      simulateDebugInputError: debugState.simulateDebugInputError,
      onToggleAutoFollow: debugState.setDebugAutoFollow,
      onSelectActor: debugState.selectDebugActor,
      onSelectViewer: debugState.selectDebugViewer,
      setMessage,
    },
  };
}
