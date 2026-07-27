"use client";

import {
  gameSdkSettingOptionValue,
  type GameSdkRoomSnapshot,
  type GameSdkSettingDefinition,
  type GameSdkSettingValue,
} from "@game-fields/game-sdk";
import type {
  GameSdkModuleId,
  GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import {
  createGameSdkHttpClientRuntime,
  GameSdkHttpClientRuntimeError,
} from "@game-fields/game-sdk/client-runtime";
import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GameSdkShellHeader } from "@/app/components/GameSdkShellHeader";
import { GameSdkFeedbackPanel } from "@/app/components/GameSdkFeedbackPanel";
import { OnlineRoomLifecycleActions } from "@/app/components/OnlineRoomLifecycleActions";
import { confirmRoomLeave } from "@/app/components/room-navigation-confirmation";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { PlayerAuthGate } from "@/app/components/PlayerAuthGate";
import { AppLink as Link } from "@/app/components/AppLink";
import { gameTopBannerActionClass } from "@/app/components/GameTopMenu";
import { useGameSdkActiveRoomRestore } from "@/app/hooks/use-game-sdk-active-room-restore";
import { useSdkPreviewSessionRequired } from "@/app/sdk-preview/SdkPreviewSessionGate";
import { withAiActivity } from "@/lib/ai-activity-client";
import { clearPlayerSession } from "@/lib/player-session";
import {
  gameSdkResultHighlights,
  gameSdkResultPlayLog,
  gameSdkResultReasonText,
} from "@/lib/game-sdk-result-presentation";
import { preferLatestOnlineRoom } from "@/lib/online-room-client-state";
import {
  roomUpdateIsOlder,
  roomUpdateIsUnchanged,
  sdkRoomViewHasReturningPlayer,
  shouldHoldRoomResultTransition,
  shouldKeepRoomResultAfterDissolve,
} from "@/lib/room-result-return";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type CommonView = {
  phase: string;
  players: Array<{
    seat: number;
    displayName: string;
    connected: boolean;
    isHost: boolean;
    isSelf: boolean;
    isDummy: boolean;
    reducedTime: boolean;
  }>;
  settings: Record<string, GameSdkSettingValue>;
  pendingLobbyReturnSeats: number[];
  minimumPlayers: number;
  maximumPlayers: number;
  isHost: boolean;
  permissions: {
    canStartGame: boolean;
    canEditRoomSettings: boolean;
    canAbort: boolean;
    canDebug: boolean;
    canDebugActAsDummy?: boolean;
    canDebugAutoProgress?: boolean;
  };
  timer?: {
    durationSeconds: number;
    startedAt: number | null;
    deadlineAt: number | null;
    turnSequence: number;
    ownerSeat?: number | null;
  };
  standardResult?: {
    winnerSeats: number[];
    rankings: Array<{
      seat: number;
      displayName: string;
      rank: number;
      score: number;
      isSelf: boolean;
    }>;
    reason: string;
    presentation?: {
      reason: { ja: string; en: string };
      highlights?: Array<{ ja: string; en: string }>;
      playLog?: Array<{ ja: string; en: string }>;
    };
  };
};

type PackageRoomView = {
  common: CommonView;
  app: unknown;
};

type PackageRoom = GameSdkRoomSnapshot<PackageRoomView>;
type SafeCommand = { type: string; [key: string]: unknown };
type DebugViewer = "self" | "spectator" | number;
type DebugAutoProgressTarget = "step" | "phase" | "result";

type Props = {
  backHref: string;
  creatorSlug?: string;
  endpoint?: string;
  gameId: string;
  runtimeId: string;
  runtimeUrl: string;
  title: string;
  settingDefinitions: readonly GameSdkSettingDefinition[];
  rules: readonly string[];
  moduleProfile: GameSdkModuleProfile;
  supportsReplay: boolean;
  supportsSpectators: boolean;
  usesLlm: boolean;
};

const panel =
  "rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-xl shadow-black/10";
const primary =
  "rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-45";
const secondary =
  "rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45";

function randomRoomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0]!.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

function errorMessage(error: unknown, preview: boolean) {
  if (error instanceof GameSdkHttpClientRuntimeError) {
    if (error.status === 401) {
      return preview
        ? "SDK PortalからPreview認証を更新してください。"
        : "ログイン状態の有効期限が切れました。ログインし直してください。";
    }
    if (error.code === "STALE_REVISION") return "部屋を最新状態へ更新しました。";
    if (error.code === "DEBUG_AUTO_PROGRESS_UNSUPPORTED") {
      return "このPackageには安全な自動進行処理がありません。";
    }
    if (error.code === "DEBUG_AUTO_PROGRESS_LIMIT") {
      return "自動進行の安全上限に達しました。現在の状態から操作を確認してください。";
    }
    if (error.code === "GAME_SDK_REMOTE_RUNNER_AUTH_FAILED") {
      return "ゲーム実行サーバーの認証設定が一致していません。運営へ報告してください。";
    }
    if (error.code === "GAME_SDK_REMOTE_RUNNER_UNAVAILABLE") {
      return "ゲーム実行サーバーへ接続できません。少し待ってから、もう一度お試しください。";
    }
    return `操作を完了できませんでした（${error.code}）。`;
  }
  if (
    error instanceof Error
    && error.message === "DEBUG_AUTO_PROGRESS_LIMIT"
  ) {
    return "自動進行の安全上限に達しました。現在の状態から操作を確認してください。";
  }
  return "操作を完了できませんでした。";
}

function appPhase(room: PackageRoom | null) {
  const app = room?.view.app;
  if (!app || typeof app !== "object" || !("phase" in app)) return null;
  const phase = (app as { phase?: unknown }).phase;
  return typeof phase === "string" && phase.trim() ? phase : null;
}

/**
 * Platform-owned GameFrame shared by candidate Preview and main.
 *
 * The immutable game package contributes only its sandboxed AppSet client
 * surface. Navigation, Room lifecycle, settings, results and Platform modules
 * remain identical in both channels.
 */
export function GameSdkFrame({
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
}: Props) {
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
  const watchRef = useRef<{ close(): void } | null>(null);
  const pendingActionRef = useRef(false);
  const pendingLobbyRoomRef = useRef<PackageRoom | null>(null);
  const roomRef = useRef<PackageRoom | null>(null);
  const debugViewerRef = useRef<DebugViewer>("self");
  const debugActorSeatRef = useRef<number | null>(null);
  const expiryRef = useRef<number | null>(null);
  const [room, setRoom] = useState<PackageRoom | null>(null);
  const [rooms, setRooms] = useState<Array<{
    code: string;
    playerCount: number;
    maximumPlayers: number;
  }>>([]);
  const [joinCode, setJoinCode] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [frameHeight, setFrameHeight] = useState(720);
  const [clockNow, setClockNow] = useState<number | null>(null);
  const [canReturnToRoom, setCanReturnToRoom] = useState(false);
  const [isRoomDissolved, setIsRoomDissolved] = useState(false);
  const [debugViewer, setDebugViewer] = useState<DebugViewer>("self");
  const [debugActorSeat, setDebugActorSeat] = useState<number | null>(null);
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

  const postRoom = useCallback((next: PackageRoom | null) => {
    const viewer = debugViewerRef.current;
    if (!next || viewer === "self") {
      postRoomSnapshot(next);
      return;
    }
    void runtime.readRoomAsDebugViewer(next.code, viewer).then((debugRoom) => {
      if (
        debugViewerRef.current === viewer
        && roomRef.current?.code === next.code
        && roomRef.current.revision === next.revision
      ) {
        postRoomSnapshot(debugRoom);
      }
    }).catch(() => {
      if (debugViewerRef.current !== viewer) return;
      debugViewerRef.current = "self";
      setDebugViewer("self");
      postRoomSnapshot(roomRef.current);
      setMessage("選択した閲覧視点を取得できないため、本人視点へ戻しました。");
    });
  }, [postRoomSnapshot, runtime]);

  const commitRoom = useCallback((next: PackageRoom | null) => {
    if (next?.phase !== "playing" && debugActorSeatRef.current !== null) {
      debugActorSeatRef.current = null;
      setDebugActorSeat(null);
    }
    roomRef.current = next;
    setRoom(next);
    postRoom(next);
  }, [postRoom]);

  const acceptIncomingRoom = useCallback((next: PackageRoom | null) => {
    const current = roomRef.current;
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
  }, [commitRoom]);

  const attachRoom = useCallback((next: PackageRoom | null) => {
    const previousCode = roomRef.current?.code;
    watchRef.current?.close();
    watchRef.current = null;
    if (!next || (previousCode && previousCode !== next.code)) {
      debugViewerRef.current = "self";
      setDebugViewer("self");
      debugActorSeatRef.current = null;
      setDebugActorSeat(null);
    }
    commitRoom(next);
    pendingLobbyRoomRef.current = null;
    setCanReturnToRoom(false);
    setIsRoomDissolved(false);
    if (!next) return;
    watchRef.current = runtime.watchRoom(next.code, {
      onRoom: acceptIncomingRoom,
      onError: handleRuntimeError,
    });
  }, [acceptIncomingRoom, commitRoom, handleRuntimeError, runtime]);

  const attachLatestRoom = useCallback((next: PackageRoom) => {
    const current = roomRef.current;
    const accepted = preferLatestOnlineRoom(current, next);
    if (accepted === current) return current;
    attachRoom(accepted);
    return accepted;
  }, [attachRoom]);

  const refreshRooms = useCallback(async () => {
    try {
      const page = await runtime.listRooms();
      setRooms(page.rooms);
    } catch (error) {
      handleRuntimeError(error);
    }
  }, [handleRuntimeError, runtime]);

  const loadActiveRoom = useCallback(
    () => runtime.readActiveRoom(),
    [runtime],
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
  }, [attachLatestRoom, attachRoom, handleRuntimeError, runtime]);

  const send = useCallback(async (command: SafeCommand) => {
    const current = roomRef.current;
    if (!current) throw new Error("ROOM_REQUIRED");
    const operation = async () => (await runtime.sendCommand(current.code, {
      expectedRevision: current.revision,
      command,
    })).room;
    return usesLlm
      && moduleRequired("llm")
      && moduleRequired("ai-activity")
      ? withAiActivity("SDKゲームのAI処理", operation)
      : operation();
  }, [moduleRequired, runtime, usesLlm]);

  const sendPackageCommand = useCallback((command: SafeCommand) => {
    const actorSeat = debugActorSeatRef.current;
    return send(
      actorSeat !== null && !command.type.startsWith("room/")
        ? {
            type: "room/debug-act-as-dummy",
            seat: actorSeat,
            command,
          }
        : command,
    );
  }, [send]);

  const selectDebugViewer = useCallback((viewer: DebugViewer) => {
    debugViewerRef.current = viewer;
    setDebugViewer(viewer);
    postRoom(roomRef.current);
  }, [postRoom]);

  const selectDebugActor = useCallback((seat: number | null) => {
    if (seat !== null) {
      const target = roomRef.current?.view.common.players[seat];
      if (!target?.isDummy) {
        setMessage("操作対象にはダミープレイヤーだけを選択できます。");
        return;
      }
    }
    debugActorSeatRef.current = seat;
    setDebugActorSeat(seat);
    selectDebugViewer(seat ?? "self");
  }, [selectDebugViewer]);

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
    return usesLlm
      && moduleRequired("llm")
      && moduleRequired("ai-activity")
      ? withAiActivity("SDKゲームのDEBUG自動進行", perform)
      : perform();
  }, [moduleRequired, runtime, usesLlm]);

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
  }, [handleRuntimeError, runtime]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data;
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "game-fields:frame-size") {
        if (Number.isFinite(payload.height)) {
          setFrameHeight(Math.min(12_000, Math.max(320, Math.ceil(payload.height))));
        }
        return;
      }
      if (payload.type === "game-fields:room-ready") {
        postRoom(roomRef.current);
        return;
      }
      if (
        payload.type !== "game-fields:room-command"
        || typeof payload.requestId !== "string"
        || !payload.command
        || typeof payload.command !== "object"
        || typeof payload.command.type !== "string"
      ) return;
      void sendPackageCommand(payload.command).then(async (next) => {
        const accepted = attachLatestRoom(next);
        const viewer = debugViewerRef.current;
        let responseRoom = accepted;
        if (viewer !== "self") {
          try {
            responseRoom = await runtime.readRoomAsDebugViewer(
              accepted.code,
              viewer,
            ) ?? accepted;
          } catch {
            if (debugViewerRef.current === viewer) {
              debugViewerRef.current = "self";
              setDebugViewer("self");
              setMessage(
                "選択した閲覧視点を取得できないため、本人視点へ戻しました。",
              );
            }
          }
        }
        iframeRef.current?.contentWindow?.postMessage({
          type: "game-fields:room-command-result",
          requestId: payload.requestId,
          room: responseRoom,
        }, "*");
      }).catch((error) => {
        iframeRef.current?.contentWindow?.postMessage({
          type: "game-fields:room-command-error",
          requestId: payload.requestId,
          error: error instanceof GameSdkHttpClientRuntimeError
            ? error.code
            : "GAME_SDK_COMMAND_REJECTED",
        }, "*");
      });
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [attachLatestRoom, postRoom, runtime, sendPackageCommand]);

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
      void send({
        type: "room/expire-timer",
        turnSequence: timer.turnSequence,
      }).then(attachLatestRoom).catch(() => undefined);
    }, Math.max(0, timer.deadlineAt + 1_500 - Date.now()));
    return () => {
      if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    };
  }, [attachLatestRoom, moduleRequired, room, send]);

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
  }, [attachLatestRoom, isRoomDissolved, runtime]);

  const joinRoomByCode = useCallback((code: string) => run(async () => {
    const target = await runtime.readRoom(code);
    if (!target) throw new Error("ROOM_NOT_FOUND");
    return (await runtime.sendCommand(target.code, {
      expectedRevision: target.revision,
      command: { type: "room/join" },
    })).room;
  }), [run, runtime]);

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
  }, [attachRoom, handleRuntimeError, moduleRequired, refreshRooms, runtime]);

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
  }, [attachRoom, handleRuntimeError, moduleRequired, refreshRooms, runtime]);

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
  const resultHighlights = standardResult
    ? gameSdkResultHighlights(standardResult, locale)
    : [];
  const resultPlayLog = standardResult
    ? gameSdkResultPlayLog(standardResult, locale)
    : [];
  const resultShareText = room?.phase === "result" && standardResult
    ? [
        locale === "en"
          ? `Played ${title} with ${common?.players.length ?? 0} player(s).`
          : `${title}を${common?.players.length ?? 0}人でプレイしました。`,
        `${locale === "en" ? "Finished" : "終了理由"}: ${resultReason}`,
        ...standardResult.rankings.slice(0, 3).map((ranking) => (
          locale === "en"
            ? `#${ranking.rank} PLAYER${ranking.seat + 1}: ${ranking.score}pt`
            : `${ranking.rank}位 PLAYER${ranking.seat + 1}: ${ranking.score}pt`
        )),
        ...resultHighlights.map((highlight) => `・${highlight}`),
      ].join("\n")
    : `${title}をプレイしました。`;
  const feedbackEndpoint = creatorSlug
    ? `/api/sdk-preview/${creatorSlug}/games/${gameId}/feedback`
    : `/api/game-sdk/${gameId}/feedback`;

  if (playerAuthRequired) {
    return <PlayerAuthGate
      title={title}
      onAuthenticated={() => {
        setPlayerAuthRequired(false);
        void refreshRooms();
      }}
    />;
  }

  if (!room) {
    if (!moduleRequired("online-room")) {
      return (
        <main className={`min-h-screen bg-slate-100 px-4 py-8 text-slate-900 ${gameTopBannerOffsetClass}`}>
          <section className={`${panel} mx-auto max-w-2xl`}>
            <h2 className="text-xl font-black">オンラインRoomは無効です</h2>
            <p className="mt-2 text-sm text-slate-600">
              このPackageではonline-room moduleが無効化されています。
            </p>
          </section>
        </main>
      );
    }
    return (
      <main className={`min-h-screen bg-slate-950 px-4 py-10 text-white ${gameTopBannerOffsetClass}`}>
        <GameSdkShellHeader
          eyebrow="SDK PACKAGE"
          title={title}
          rules={rules}
          backHref={backHref}
          backLabel={creatorSlug ? "制作者ページへ" : "広場へ戻る"}
          surface="lounge"
        />
        {isRestoringRoom ? (
          <section className="mx-auto max-w-5xl">
            <div className={panel}>
              <h2 className="text-xl font-black">前の部屋を確認中</h2>
              <p className="mt-2 text-sm text-slate-600">
                参加中の部屋があれば、そのまま復帰します。
              </p>
            </div>
          </section>
        ) : (
        <section className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
          <div className={panel}>
            <h2 className="text-xl font-black">正式Roomで確認</h2>
            <p className="mt-2 text-sm text-slate-600">
              Previewと昇格後は同じAppSet bundle・Room Runtimeを使います。
            </p>
            <button
              type="button"
              className={`${primary} mt-5 w-full`}
              disabled={pending}
              onClick={() => void run(() => runtime.createRoom({
                roomCode: randomRoomCode(),
                create: { settings: defaultSettings, app: {} },
              }))}
            >
              部屋を作る
            </button>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <input
                className="rounded-xl border border-slate-300 px-4 py-3 font-mono font-black"
                value={joinCode}
                maxLength={12}
                placeholder="部屋コード"
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              />
              <button
                type="button"
                className={secondary}
                disabled={pending || joinCode.length < 4}
                onClick={() => void joinRoomByCode(joinCode)}
              >
                参加
              </button>
            </div>
            {message && <p className="mt-3 text-sm font-bold text-rose-700">{message}</p>}
          </div>
          <div className={panel}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">募集中の部屋</h2>
              <button type="button" className={secondary} onClick={() => void refreshRooms()}>更新</button>
            </div>
            {rooms.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">現在、参加できる部屋はありません。</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {rooms.map((candidate) => (
                  <li key={candidate.code} className="flex items-center justify-between gap-3 rounded-lg bg-slate-100 p-3">
                    <div>
                      <strong className="font-mono">{candidate.code}</strong>
                      <span className="ml-3 text-sm text-slate-600">
                        {candidate.playerCount}/{candidate.maximumPlayers}人
                      </span>
                    </div>
                    <button
                      type="button"
                      className={secondary}
                      disabled={pending}
                      onClick={() => void joinRoomByCode(candidate.code)}
                    >
                      参加
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        )}
        {moduleRequired("ads") && (
          <GameAdSlot gameId={gameId} surface="game-entry" />
        )}
      </main>
    );
  }

  return (
    <main className={`min-h-screen bg-slate-950 px-4 py-8 text-white ${gameTopBannerOffsetClass}`}>
      <GameSdkShellHeader
        eyebrow={`ROOM ${room.code} · rev ${room.revision}`}
        title={title}
        rules={rules}
        backHref={backHref}
        backLabel={creatorSlug ? "制作者ページへ" : "広場へ戻る"}
        surface={
          room.phase === "lobby"
            ? "lobby"
            : room.phase === "result"
              ? "result"
              : "playing"
        }
        debugRoom={moduleRequired("debug") && common?.permissions.canDebug ? {
          appPhase: appPhase(room),
          canActAsDummy: common.permissions.canDebugActAsDummy === true,
          canAutoProgress: common.permissions.canDebugAutoProgress === true,
          canUseSpectatorView: (
            supportsSpectators
            && moduleRequired("spectators")
          ),
          code: room.code,
          disabled: room.phase !== "lobby",
          selectedActorSeat: debugActorSeat,
          selectedViewer: debugViewer,
          isSubmitting: pending,
          maximumPlayers: common.maximumPlayers,
          onAddDummy: async () => {
            await run(() => send({
              type: "room/debug-add-dummy",
            }));
          },
          onRemoveDummy: async (seat) => {
            await run(() => send({
              type: "room/debug-remove-dummy",
              seat,
            }));
          },
          onAutoProgress: async (target) => {
            await run(() => autoProgressDebug(target));
          },
          onSelectActor: selectDebugActor,
          onSelectViewer: selectDebugViewer,
          onSetConnected: async (seat, connected) => {
            await run(() => send({
              type: "room/debug-set-connected",
              seat,
              connected,
            }));
          },
          onSimulateInputError: simulateDebugInputError,
          onSimulateTimeout: async () => {
            await run(() => send({
              type: "room/debug-simulate-timeout",
            }));
          },
          players: common.players,
          revision: room.revision,
          phase: room.phase,
          statusMessage: message,
        } : null}
      >
        {!creatorSlug
          && supportsSpectators
          && moduleRequired("spectators")
          && common?.isHost && (
          <Link
            href={`/spectate/${encodeURIComponent(`sdk:${gameId}`)}/${room.code}`}
            className={gameTopBannerActionClass}
          >
            観戦・共有
          </Link>
        )}
        {common?.permissions.canAbort && room.phase === "playing" && (
          <button
            type="button"
            className={gameTopBannerActionClass}
            disabled={pending}
            onClick={() => void run(() => send({ type: "room/abort" }))}
          >
            中断
          </button>
        )}
      </GameSdkShellHeader>
      <section className={room.phase === "playing"
        ? "mx-auto max-w-7xl"
        : "mx-auto grid max-w-7xl gap-5 lg:grid-cols-[300px_minmax(0,1fr)]"}
      >
        {room.phase !== "playing" && (
        <aside className={`space-y-4 ${
          room.phase === "result" ? "order-2 lg:order-1" : "order-1"
        }`}>
          <div className={panel}>
            <h2 className="text-lg font-black">
              {room.phase === "lobby" ? "ゲーム開始前" : room.phase === "result" ? "結果" : "プレイ中"}
            </h2>
            <ul className="mt-3 space-y-2">
              {common?.players.map((player) => (
                <li key={player.seat} className="rounded-lg bg-slate-100 p-3 text-sm">
                  SEAT {player.seat + 1} · {player.displayName}
                  {player.isSelf ? "（あなた）" : ""}
                  {player.isHost ? " · HOST" : ""}
                </li>
              ))}
            </ul>
            {common?.permissions.canStartGame && (
              <button type="button" className={`${primary} mt-4 w-full`} disabled={pending} onClick={() => void run(() => send({ type: "game/start" }))}>
                ゲームを開始
              </button>
            )}
            {room.phase === "result" && standardResult && moduleRequired("result") && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="text-xs font-black uppercase tracking-wide text-cyan-700">
                  Standard result
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  {resultReason}
                </p>
                <ol className="mt-3 space-y-2">
                  {standardResult.rankings.map((ranking) => (
                    <li
                      key={ranking.seat}
                      className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm"
                    >
                      <span>
                        {ranking.rank}位 · {ranking.displayName}
                        {ranking.isSelf ? "（あなた）" : ""}
                      </span>
                      <strong>{ranking.score} pt</strong>
                    </li>
                  ))}
                </ol>
                {resultPlayLog.length > 0 && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <p className="text-xs font-black uppercase tracking-wide text-violet-700">
                      {locale === "en" ? "Play log" : "プレイログ"}
                    </p>
                    <ol className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                      {resultPlayLog.map((line, index) => (
                        <li key={`${index}:${line}`} className="rounded-lg bg-slate-100 px-3 py-2">
                          {line}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
            {message && <p className="mt-3 text-sm font-bold text-rose-700">{message}</p>}
            <OnlineRoomLifecycleActions
              surface={room.phase === "result" ? "result" : room.phase === "lobby" ? "lobby" : "playing"}
              isHost={common?.isHost === true}
              disabled={pending}
              canReturnToRoom={
                room.phase === "result"
                && (common?.isHost === true || canReturnToRoom)
              }
              isRoomDissolved={isRoomDissolved}
              onReturnToRoom={room.phase === "result"
                && moduleRequired("rematch")
                ? common?.isHost
                  ? () => run(() => send({ type: "room/rematch" }))
                  : returnToRoom
                : undefined}
              onDissolve={moduleRequired("dissolution")
                && (room.phase === "lobby" || room.phase === "result")
                ? dissolveRoom
                : undefined}
              onLeave={moduleRequired("online-room")
                && room.phase === "lobby"
                && common?.isHost === false
                ? leaveRoom
                : undefined}
              returnHref={backHref}
            />
          </div>
          {room.phase === "lobby" && moduleRequired("room-settings") && (
            <div className={panel}>
              <h2 className="text-lg font-black">部屋設定</h2>
              <div className="mt-3 space-y-3">
                {settingDefinitions.map((definition) => {
                  const value = common?.settings[definition.key]
                    ?? definition.defaultValue;
                  return (
                    <label key={definition.key} className="block text-sm font-bold">
                      {definition.label.ja}
                      {definition.type === "select" && definition.options ? (
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                          disabled={!common?.permissions.canEditRoomSettings || pending}
                          value={String(value)}
                          onChange={(event) => {
                            const option = definition.options?.find(
                              (candidate) => String(gameSdkSettingOptionValue(candidate)) === event.target.value,
                            );
                            if (!option) return;
                            void run(() => send({
                              type: "room/update-settings",
                              settings: {
                                [definition.key]: gameSdkSettingOptionValue(option),
                              },
                            }));
                          }}
                        >
                          {definition.options.map((option) => {
                            const optionValue = gameSdkSettingOptionValue(option);
                            return <option key={String(optionValue)} value={String(optionValue)}>{typeof option === "object" ? option.label.ja : `${optionValue}${definition.unit?.ja ?? ""}`}</option>;
                          })}
                        </select>
                      ) : definition.type === "boolean" ? (
                        <input
                          type="checkbox"
                          className="mt-2 block size-5 accent-cyan-600"
                          disabled={!common?.permissions.canEditRoomSettings || pending}
                          checked={value === true}
                          onChange={(event) => {
                            void run(() => send({
                              type: "room/update-settings",
                              settings: {
                                [definition.key]: event.target.checked,
                              },
                            }));
                          }}
                        />
                      ) : definition.type === "number" ? (
                        <input
                          key={`${room.revision}:${definition.key}`}
                          type="number"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                          disabled={!common?.permissions.canEditRoomSettings || pending}
                          defaultValue={typeof value === "number" ? value : ""}
                          min={definition.minimum}
                          max={definition.maximum}
                          onBlur={(event) => {
                            const nextValue = Number(event.target.value);
                            if (!Number.isFinite(nextValue) || nextValue === value) return;
                            void run(() => send({
                              type: "room/update-settings",
                              settings: {
                                [definition.key]: nextValue,
                              },
                            }));
                          }}
                        />
                      ) : definition.type === "text" ? (
                        <input
                          key={`${room.revision}:${definition.key}`}
                          type="text"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                          disabled={!common?.permissions.canEditRoomSettings || pending}
                          defaultValue={typeof value === "string" ? value : ""}
                          onBlur={(event) => {
                            if (event.target.value === value) return;
                            void run(() => send({
                              type: "room/update-settings",
                              settings: {
                                [definition.key]: event.target.value,
                              },
                            }));
                          }}
                        />
                      ) : (
                        <span className="mt-1 block rounded-lg bg-slate-100 px-3 py-2">{String(value)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
              {common?.permissions.canEditRoomSettings && (
                <button
                  type="button"
                  className={`${secondary} mt-4 w-full`}
                  disabled={pending}
                  onClick={() => void fetch(defaultsEndpoint, {
                    method: "PUT",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ settings: common.settings }),
                  }).then(async (response) => {
                    if (!response.ok) throw new Error("DEFAULT_SAVE_FAILED");
                    const body = await response.json() as {
                      settings: Record<string, GameSdkSettingValue>;
                    };
                    setPlayerDefaults(body.settings);
                    setMessage("この設定を次回の既定値に保存しました。");
                  }).catch(() => {
                    setMessage("既定値を保存できませんでした。");
                  })}
                >
                  この設定を次回の既定値にする
                </button>
              )}
            </div>
          )}
          {room.phase === "result" && supportsReplay && moduleRequired("replay") && (
            <div className={panel}>
              <p className="text-xs font-black uppercase tracking-wide text-violet-700">
                プレイバック
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                この結果は参加者本人の履歴へ保存され、マイページから確認できます。
              </p>
              <Link
                href="/users/me"
                className={`${secondary} mt-4 block text-center`}
              >
                履歴を確認
              </Link>
            </div>
          )}
          {room.phase === "result" && moduleRequired("result-share") && (
            <GameResultShareButton
              title={`${title}の結果`}
              text={resultShareText}
              url={creatorSlug ? backHref : `/sdk-games/${gameId}`}
            />
          )}
          {room.phase === "result"
            && usesLlm
            && moduleRequired("llm")
            && moduleRequired("feedback") && (
            <GameSdkFeedbackPanel
              endpoint={feedbackEndpoint}
              roomCode={room.code}
              resultReason={resultReason || "result"}
            />
          )}
        </aside>
        )}
        <div className={`min-w-0 overflow-hidden ${
          room.phase === "result" ? "order-1 lg:order-2" : "order-2"
        }`}>
          {room.phase !== "lobby"
            && room.phase !== "result"
            && moduleRequired("timer")
            && timer && (
            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3"
              role="timer"
              aria-live="polite"
            >
              <strong>残り時間</strong>
              <span className="font-mono text-xl font-black">
                {remainingSeconds === null ? "制限なし" : `${remainingSeconds}秒`}
              </span>
              {self?.reducedTime && (
                <button
                  type="button"
                  className={gameTopBannerActionClass}
                  disabled={pending}
                  onClick={() => void run(() => send({
                    type: "room/recover-timeout",
                  }))}
                >
                  復帰して通常時間へ戻す
                </button>
              )}
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={runtimeUrl}
            title={`${title} game package`}
            sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock"
            className="block w-full border-0"
            style={{ height: frameHeight }}
            onLoad={() => postRoom(roomRef.current)}
          />
        </div>
      </section>
      {moduleRequired("ads") && (
        <GameAdSlot
          gameId={gameId}
          surface={room.phase === "lobby"
            ? "room-lobby"
            : room.phase === "result"
              ? "result"
              : null}
          disabled={common?.permissions.canDebug === true}
        />
      )}
    </main>
  );
}
