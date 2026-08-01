"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  gameSdkCommandTimingForRoom,
  GameSdkHttpClientRuntimeError,
} from "@game-fields/game-sdk/client-runtime";
import { gameTopBannerActionClass } from "@/app/components/GameTopMenu";
import { GameSdkIframe } from "./GameSdkIframe";
import type {
  CommonView,
  PackageRoom,
  SafeCommand,
} from "./game-sdk-frame-types";

type Options = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  roomRef: MutableRefObject<PackageRoom | null>;
  runtimeUrl: string;
  debugCanSend: boolean;
  postRoom: (room: PackageRoom | null) => void;
  setMessage: (message: string) => void;
  attachLatestRoom: (next: PackageRoom) => PackageRoom;
  sendPackageCommand: (command: SafeCommand) => Promise<PackageRoom>;
};

export function useGameSdkIframeBridge({
  iframeRef,
  roomRef,
  runtimeUrl,
  debugCanSend,
  postRoom,
  setMessage,
  attachLatestRoom,
  sendPackageCommand,
}: Options) {
  const [frameHeight, setFrameHeight] = useState(720);
  const [clientLoadFailed, setClientLoadFailed] = useState(false);
  const clientReadyRef = useRef(false);
  const clientLoadTimerRef = useRef<number | null>(null);
  const presentationWaitersRef = useRef(new Map<string, () => void>());

  const clearClientLoadTimer = useCallback(() => {
    if (clientLoadTimerRef.current !== null) {
      window.clearTimeout(clientLoadTimerRef.current);
      clientLoadTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clientReadyRef.current = false;
    clearClientLoadTimer();
    return clearClientLoadTimer;
  }, [clearClientLoadTimer, runtimeUrl]);

  useEffect(() => {
    const presentationWaiters = presentationWaitersRef.current;
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data;
      if (!payload || typeof payload !== "object") return;
      if (
        payload.type === "game-fields:room-state-presented"
        && typeof payload.traceRef === "string"
        && /^command_[A-Za-z0-9_-]{8,80}$/.test(payload.traceRef)
        && Number.isSafeInteger(payload.revision)
      ) {
        const key = `${payload.traceRef}:${payload.revision}`;
        presentationWaitersRef.current.get(key)?.();
        presentationWaitersRef.current.delete(key);
        return;
      }
      if (payload.type === "game-fields:frame-size") {
        if (Number.isFinite(payload.height)) {
          setFrameHeight(Math.min(12_000, Math.max(320, Math.ceil(payload.height))));
        }
        return;
      }
      if (payload.type === "game-fields:room-ready") {
        clientReadyRef.current = true;
        clearClientLoadTimer();
        setClientLoadFailed(false);
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
      if (!debugCanSend) {
        iframeRef.current?.contentWindow?.postMessage({
          type: "game-fields:room-command-error",
          requestId: payload.requestId,
          error: "DEBUG_ACTOR_SWITCH_PENDING",
        }, "*");
        return;
      }
      void sendPackageCommand(payload.command).then(async (next) => {
        const timing = gameSdkCommandTimingForRoom(next);
        const presentationKey = timing?.traceRef
          ? `${timing.traceRef}:${timing.revision}`
          : null;
        const presented = presentationKey
          ? new Promise<void>((resolve) => {
              presentationWaiters.set(presentationKey, resolve);
            })
          : new Promise<void>((resolve) => {
              window.requestAnimationFrame(() => resolve());
            });
        const accepted = attachLatestRoom(next);
        await presented;
        iframeRef.current?.contentWindow?.postMessage({
          type: "game-fields:room-command-result",
          requestId: payload.requestId,
          room: accepted,
          stateDelivered: true,
          ...(timing ? {
            timing: {
              traceRef: timing.traceRef,
              revision: timing.revision,
            },
          } : {}),
        }, "*");
      }).catch((error) => {
        iframeRef.current?.contentWindow?.postMessage({
          type: "game-fields:room-command-error",
          requestId: payload.requestId,
          error: error instanceof GameSdkHttpClientRuntimeError
            ? error.code
            : error instanceof Error && error.message === "DEBUG_ACTOR_SWITCH_PENDING"
              ? "DEBUG_ACTOR_SWITCH_PENDING"
              : "GAME_SDK_COMMAND_REJECTED",
        }, "*");
      });
    };
    window.addEventListener("message", listener);
    return () => {
      window.removeEventListener("message", listener);
      for (const resolve of presentationWaiters.values()) resolve();
      presentationWaiters.clear();
    };
  }, [
    attachLatestRoom,
    clearClientLoadTimer,
    debugCanSend,
    iframeRef,
    postRoom,
    roomRef,
    sendPackageCommand,
    setMessage,
  ]);

  const handleLoad = useCallback(() => {
    postRoom(roomRef.current);
    clearClientLoadTimer();
    setClientLoadFailed(false);
    if (clientReadyRef.current) return;
    clientLoadTimerRef.current = window.setTimeout(() => {
      if (clientReadyRef.current) return;
      setClientLoadFailed(true);
      setMessage(
        "固定revisionのclientを読み込めませんでした。旧Mockや別revisionには切り替えていません。",
      );
    }, 15_000);
  }, [clearClientLoadTimer, postRoom, roomRef, setMessage]);

  return { clientLoadFailed, frameHeight, handleLoad };
}

type ViewProps = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  roomRef: MutableRefObject<PackageRoom | null>;
  runtimeUrl: string;
  title: string;
  phase: string;
  timer: CommonView["timer"];
  remainingSeconds: number | null;
  reducedTime: boolean | undefined;
  timerModuleRequired: boolean;
  pending: boolean;
  onRecoverTimeout: () => void;
  debugCanSend: boolean;
  postRoom: (room: PackageRoom | null) => void;
  setMessage: (message: string) => void;
  attachLatestRoom: (next: PackageRoom) => PackageRoom;
  sendPackageCommand: (command: SafeCommand) => Promise<PackageRoom>;
};

type CountdownProps = {
  deadlineAt: number | null;
  reducedTime: boolean | undefined;
  pending: boolean;
  onRecoverTimeout: () => void;
};

const GameSdkTimerCountdown = memo(function GameSdkTimerCountdown({
  deadlineAt,
  reducedTime,
  pending,
  onRecoverTimeout,
}: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [deadlineAt]);

  const remainingSeconds = deadlineAt === null
    ? null
    : Math.max(0, Math.ceil((deadlineAt - now) / 1000));

  return (
    <div
      className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3"
      role="timer"
      aria-live="polite"
    >
      <strong>残り時間</strong>
      <span className="font-mono text-xl font-black">
        {remainingSeconds === null ? "制限なし" : `${remainingSeconds}秒`}
      </span>
      {reducedTime && (
        <button
          type="button"
          className={gameTopBannerActionClass}
          disabled={pending}
          onClick={onRecoverTimeout}
        >
          復帰して通常時間へ戻す
        </button>
      )}
    </div>
  );
});

export function GameSdkIframeBridge({
  iframeRef,
  roomRef,
  runtimeUrl,
  title,
  phase,
  timer,
  reducedTime,
  timerModuleRequired,
  pending,
  onRecoverTimeout,
  debugCanSend,
  postRoom,
  setMessage,
  attachLatestRoom,
  sendPackageCommand,
}: ViewProps) {
  const { clientLoadFailed, frameHeight, handleLoad } = useGameSdkIframeBridge({
    iframeRef,
    roomRef,
    runtimeUrl,
    debugCanSend,
    postRoom,
    setMessage,
    attachLatestRoom,
    sendPackageCommand,
  });

  return (
    <>
      {phase !== "lobby" && phase !== "result" && timerModuleRequired && timer && (
        <GameSdkTimerCountdown
          deadlineAt={timer.deadlineAt}
          reducedTime={reducedTime}
          pending={pending}
          onRecoverTimeout={onRecoverTimeout}
        />
      )}
      {clientLoadFailed && (
        <div
          className="mb-3 rounded-xl border border-red-300 bg-red-50 p-4 font-bold text-red-800"
          role="alert"
        >
          <p>Package clientを読み込めませんでした。</p>
          <p className="mt-1 font-mono text-xs">
            GAME_SDK_PACKAGE_CLIENT_LOAD_FAILED
          </p>
          <p className="mt-2 text-sm">
            固定revisionのまま停止しています。旧Mockや別revisionへのフォールバックは行っていません。
          </p>
        </div>
      )}
      <GameSdkIframe
        ref={iframeRef}
        src={runtimeUrl}
        title={`${title} game package`}
        className="block w-full border-0"
        style={{ height: frameHeight }}
        onLoad={handleLoad}
      />
    </>
  );
}
