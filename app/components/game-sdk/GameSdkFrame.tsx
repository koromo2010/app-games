"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GameSdkSettingValue } from "@game-fields/game-sdk";
import type { GameSdkModuleId } from "@game-fields/game-sdk/modules";
import {
  createGameSdkHttpClientRuntime,
  GameSdkHttpClientRuntimeError,
} from "@game-fields/game-sdk/client-runtime";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { useSdkPreviewSessionRequired } from "@/app/sdk-preview/SdkPreviewSessionGate";
import { clearPlayerSession } from "@/lib/player-session";
import { gameSdkDebugAutoFollowTarget } from "@/lib/game-sdk-debug-control-target";
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

/**
 * Composition root extracted out of GameSdkFrame.tsx. Owns the state and
 * refs that are genuinely shared across more than one concern (room ref,
 * iframe ref, pending/message, module-profile lookup, error handling,
 * player-defaults fetch) and wires the four split hooks together in the
 * same dependency order the original single component implicitly had:
 *
 *   debug primitives -> room lifecycle -> command dispatch -> auto-follow
 *   effect + expiry/clock effects + derived view values
 *
 * `useGameSdkDebugState` cannot depend on `room` (owned by
 * `useGameSdkRoomLifecycle`) because the lifecycle hook itself depends on
 * `resetDebugControl`/`postRoom` from the debug hook — so the auto-follow
 * effect, which *does* need reactive `room`, lives here instead of inside
 * either hook. See use-game-sdk-debug-state.ts for details.
 *
 * No behavior differs from the pre-split GameSdkFrame.tsx.
 */
export function useGameSdkFrameController(
  props: GameSdkFrameProps,
): { viewProps: GameSdkFrameViewProps } {
  const {
    backHref,
    creatorSlug,
    endpoint: endpointInput,
    gameId,
    runtimeId,
    runtimeUrl,
    title,
    settingDefinitions,
    rules,
    moduleProfile,
    supportsReplay,
    supportsSpectators,
    usesLlm,
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
  const [clockNow, setClockNow] = useState<number | null>(null);
  const [playerDefaults, setPlayerDefaults] = useState<
    Record<string, GameSdkSettingValue>
  >({});

  const moduleRequired = useCallback((id: GameSdkModuleId) => (
    moduleProfile[id].mode === "required"
  ), [moduleProfile]);

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
    setMessage(errorMessage(error, Boolean(creatorSlug)));
  }, [creatorSlug, requirePreviewSession]);

  const defaultsEndpoint = creatorSlug
    ? `/api/sdk-preview/${creatorSlug}/games/${gameId}/defaults`
    : `/api/game-sdk/${gameId}/defaults`;

  useEffect(() => {
    if (!moduleRequired("room-settings")) return;
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
  }, [defaultsEndpoint, moduleRequired]);

  const postRoomSnapshot = useCallback((next: PackageRoom | null) => {
    iframeRef.current?.contentWindow?.postMessage({
      type: "game-fields:room-snapshot",
      room: next,
    }, "*");
  }, []);

  const debugState = useGameSdkDebugState({
    roomRef,
    runtime,
    usesLlm,
    moduleProfile,
    postRoomSnapshot,
    setMessage,
    pendingActionRef,
    setPending,
    handleRuntimeError,
  });

  const lifecycle = useGameSdkRoomLifecycle({
    runtime,
    moduleRequired,
    handleRuntimeError,
    roomRef,
    pendingActionRef,
    setPending,
    setMessage,
    debugActorSeat: debugState.debugActorSeat,
    resetDebugControl: debugState.resetDebugControl,
    postRoom: debugState.postRoom,
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
    moduleProfile,
    wrapDebugCommand: debugState.wrapDebugCommand,
  });

  const { room } = lifecycle;
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

  useEffect(() => {
    const timer = room?.view.common.timer;
    if (
      !moduleRequired("timer")
      || room?.phase === "lobby"
      || room?.phase === "result"
      || !timer
    ) return;
    const update = () => setClockNow(Date.now());
    const initialUpdate = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 250);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, [moduleRequired, room?.phase, room?.view.common.timer]);

  const joinRoomByCode = useCallback((code: string) => commandRunner.run(async () => {
    const target = await runtime.readRoom(code);
    if (!target) throw new Error("ROOM_NOT_FOUND");
    return (await runtime.sendCommand(target.code, {
      expectedRevision: target.revision,
      command: { type: "room/join" },
    })).room;
  }), [commandRunner, runtime]);

  const defaultSettings = useMemo(() => Object.fromEntries(
    settingDefinitions.map((definition) => [
      definition.key,
      playerDefaults[definition.key] ?? definition.defaultValue,
    ]),
  ), [playerDefaults, settingDefinitions]);

  const common = room?.view.common;
  const self = common?.players.find((player) => player.isSelf);
  const timer = common?.timer;
  const remainingSeconds = timer?.deadlineAt && clockNow !== null
    ? Math.max(0, Math.ceil((timer.deadlineAt - clockNow) / 1000))
    : null;
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
    void lifecycle.refreshRooms();
  }, [lifecycle.refreshRooms]);

  const onCreateRoom = useCallback(() => {
    void commandRunner.run(() => runtime.createRoom({
      roomCode: randomRoomCode(),
      create: { settings: defaultSettings, app: {} },
    }));
  }, [commandRunner, defaultSettings, runtime]);

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

  const onReturnToRoom = room && room.phase === "result" && moduleRequired("rematch")
    ? (common?.isHost
      ? () => {
        void commandRunner.run(() => commandRunner.send({ type: "room/rematch" }));
      }
      : lifecycle.returnToRoom)
    : undefined;
  const onDissolve = moduleRequired("dissolution")
    && room
    && (room.phase === "lobby" || room.phase === "result")
    ? lifecycle.dissolveRoom
    : undefined;
  const onLeave = moduleRequired("online-room")
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
      rules,
      room,
      roomRef,
      iframeRef,
      runtime,
      runtimeUrl,
      moduleRequired,
      pending,
      message,
      isRestoringRoom: lifecycle.isRestoringRoom,
      joinCode,
      setJoinCode,
      rooms: lifecycle.rooms,
      onCreateRoom,
      onJoinRoomByCode: joinRoomByCode,
      onRefreshRooms: () => void lifecycle.refreshRooms(),
      common,
      supportsReplay,
      supportsSpectators,
      usesLlm,
      reducedTime: self?.reducedTime,
      timer,
      remainingSeconds,
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
      resetDebugControl: debugState.resetDebugControl,
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
