"use client";

import {
  useCallback,
  useEffect,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { GameSdkHttpClientRuntimeError } from "@game-fields/game-sdk/client-runtime";
import { gameTopBannerActionClass } from "@/app/components/GameTopMenu";
import { GameSdkIframe } from "./GameSdkIframe";
import type {
  CommonView,
  DebugViewer,
  GameSdkFrameRuntime,
  PackageRoom,
  SafeCommand,
} from "./game-sdk-frame-types";

type Options = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  roomRef: MutableRefObject<PackageRoom | null>;
  runtime: GameSdkFrameRuntime;
  debugCanSend: boolean;
  debugViewer: DebugViewer;
  postRoom: (room: PackageRoom | null) => void;
  resetDebugControl: () => void;
  setMessage: (message: string) => void;
  attachLatestRoom: (next: PackageRoom) => PackageRoom;
  sendPackageCommand: (command: SafeCommand) => Promise<PackageRoom>;
};

/**
 * postMessage bridge extracted out of GameSdkFrame.tsx: listens for
 * `game-fields:frame-size`, `game-fields:room-ready` and
 * `game-fields:room-command` messages from the sandboxed package iframe and
 * replies with `game-fields:room-command-result` /
 * `game-fields:room-command-error`. Behavior is unchanged from the pre-split
 * implementation.
 */
export function useGameSdkIframeBridge({
  iframeRef,
  roomRef,
  runtime,
  debugCanSend,
  debugViewer,
  postRoom,
  resetDebugControl,
  setMessage,
  attachLatestRoom,
  sendPackageCommand,
}: Options) {
  const [frameHeight, setFrameHeight] = useState(720);

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
      if (!debugCanSend) {
        iframeRef.current?.contentWindow?.postMessage({
          type: "game-fields:room-command-error",
          requestId: payload.requestId,
          error: "DEBUG_ACTOR_SWITCH_PENDING",
        }, "*");
        return;
      }
      void sendPackageCommand(payload.command).then(async (next) => {
        const accepted = attachLatestRoom(next);
        const viewer = debugViewer;
        let responseRoom = accepted;
        if (viewer !== "self") {
          try {
            responseRoom = await runtime.readRoomAsDebugViewer(
              accepted.code,
              viewer,
            ) ?? accepted;
          } catch {
            resetDebugControl();
            setMessage(
              "選択した閲覧視点を取得できないため、本人視点へ戻しました。",
            );
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
            : error instanceof Error && error.message === "DEBUG_ACTOR_SWITCH_PENDING"
              ? "DEBUG_ACTOR_SWITCH_PENDING"
              : "GAME_SDK_COMMAND_REJECTED",
        }, "*");
      });
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [
    attachLatestRoom,
    debugCanSend,
    debugViewer,
    iframeRef,
    postRoom,
    resetDebugControl,
    roomRef,
    runtime,
    sendPackageCommand,
    setMessage,
  ]);

  const handleLoad = useCallback(() => {
    postRoom(roomRef.current);
  }, [postRoom, roomRef]);

  return { frameHeight, handleLoad };
}

type ViewProps = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  roomRef: MutableRefObject<PackageRoom | null>;
  runtime: GameSdkFrameRuntime;
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
  debugViewer: DebugViewer;
  postRoom: (room: PackageRoom | null) => void;
  resetDebugControl: () => void;
  setMessage: (message: string) => void;
  attachLatestRoom: (next: PackageRoom) => PackageRoom;
  sendPackageCommand: (command: SafeCommand) => Promise<PackageRoom>;
};

/**
 * Renders the residual-time HUD (when the `timer` module is required and the
 * room is mid-play) plus the sandboxed package `<iframe>` itself, wired
 * through `useGameSdkIframeBridge`.
 */
export function GameSdkIframeBridge({
  iframeRef,
  roomRef,
  runtime,
  runtimeUrl,
  title,
  phase,
  timer,
  remainingSeconds,
  reducedTime,
  timerModuleRequired,
  pending,
  onRecoverTimeout,
  debugCanSend,
  debugViewer,
  postRoom,
  resetDebugControl,
  setMessage,
  attachLatestRoom,
  sendPackageCommand,
}: ViewProps) {
  const { frameHeight, handleLoad } = useGameSdkIframeBridge({
    iframeRef,
    roomRef,
    runtime,
    debugCanSend,
    debugViewer,
    postRoom,
    resetDebugControl,
    setMessage,
    attachLatestRoom,
    sendPackageCommand,
  });

  return (
    <>
      {phase !== "lobby" && phase !== "result" && timerModuleRequired && timer && (
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
