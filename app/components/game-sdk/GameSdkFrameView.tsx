"use client";

import type { MutableRefObject, RefObject } from "react";
import type { GameSdkModuleId } from "@game-fields/game-sdk/modules";
import type { GameSdkSettingDefinition, GameSdkSettingValue } from "@game-fields/game-sdk";
import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GameSdkShellHeader } from "@/app/components/GameSdkShellHeader";
import { OnlineRoomLifecycleActions } from "@/app/components/OnlineRoomLifecycleActions";
import { AppLink as Link } from "@/app/components/AppLink";
import { gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { gameTopBannerActionClass } from "@/app/components/GameTopMenu";
import { PlayerAuthGate } from "@/app/components/PlayerAuthGate";
import { GameSdkDebugPanel } from "./GameSdkDebugPanel";
import { GameSdkLobbyPanel } from "./GameSdkLobbyPanel";
import { GameSdkResultPanel } from "./GameSdkResultPanel";
import { GameSdkIframeBridge } from "./GameSdkIframeBridge";
import { panel, primary, secondary } from "./game-sdk-frame-shared";
import type {
  CommonView,
  DebugAutoProgressTarget,
  DebugViewer,
  GameSdkFrameRuntime,
  PackageRoom,
  SafeCommand,
} from "./game-sdk-frame-types";

export type GameSdkFrameViewProps = {
  // top level
  playerAuthRequired: boolean;
  onPlayerAuthenticated: () => void;
  title: string;
  gameId: string;
  backHref: string;
  creatorSlug?: string;
  rules: readonly string[];
  room: PackageRoom | null;
  roomRef: MutableRefObject<PackageRoom | null>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  runtime: GameSdkFrameRuntime;
  runtimeUrl: string;
  moduleRequired: (id: GameSdkModuleId) => boolean;
  pending: boolean;
  message: string;
  isRestoringRoom: boolean;

  // lounge (no room yet)
  joinCode: string;
  setJoinCode: (value: string) => void;
  rooms: Array<{ code: string; playerCount: number; maximumPlayers: number }>;
  onCreateRoom: () => void;
  onJoinRoomByCode: (code: string) => void;
  onRefreshRooms: () => void;

  // room-exists view
  common: CommonView | undefined;
  supportsReplay: boolean;
  supportsSpectators: boolean;
  usesLlm: boolean;
  reducedTime: boolean | undefined;
  timer: CommonView["timer"];
  remainingSeconds: number | null;
  standardResult: CommonView["standardResult"];
  resultReason: string;
  resultPlayLog: string[];
  resultShareText: string;
  canReturnToRoom: boolean;
  isRoomDissolved: boolean;
  onReturnToRoom: (() => void) | undefined;
  onDissolve: (() => void) | undefined;
  onLeave: (() => void) | undefined;
  onStart: () => void;
  onAbort: () => void;
  onRecoverTimeout: () => void;
  settingDefinitions: readonly GameSdkSettingDefinition[];
  defaultsEndpoint: string;
  onSaveDefaults: (settings: Record<string, GameSdkSettingValue>) => void;
  feedbackEndpoint: string;

  // debug
  debugAutoFollow: boolean;
  debugOwnerSeat: number | null | undefined;
  debugActorSeat: number | null;
  debugViewer: DebugViewer;
  debugSwitchSource: "manual" | "auto-follow" | "reset";
  debugCanSend: boolean;
  postRoom: (room: PackageRoom | null) => void;
  resetDebugControl: () => void;
  run: (operation: () => Promise<PackageRoom>) => Promise<PackageRoom | null>;
  send: (command: SafeCommand) => Promise<PackageRoom>;
  sendPackageCommand: (command: SafeCommand) => Promise<PackageRoom>;
  attachLatestRoom: (next: PackageRoom) => PackageRoom;
  autoProgressDebug: (target: DebugAutoProgressTarget) => Promise<PackageRoom>;
  simulateDebugInputError: () => Promise<void>;
  onToggleAutoFollow: (enabled: boolean) => void;
  onSelectActor: (seat: number | null) => void;
  onSelectViewer: (viewer: DebugViewer) => void;
  setMessage: (message: string) => void;
};

/**
 * Presentational component extracted out of GameSdkFrame.tsx's render body.
 * `useGameSdkFrameController` computes every value here; this component only
 * decides which markup to show for the current phase. Markup, classNames and
 * copy are unchanged from the pre-split component.
 */
export function GameSdkFrameView(props: GameSdkFrameViewProps) {
  const {
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
    isRestoringRoom,
    joinCode,
    setJoinCode,
    rooms,
    onCreateRoom,
    onJoinRoomByCode,
    onRefreshRooms,
    common,
    supportsReplay,
    supportsSpectators,
    usesLlm,
    reducedTime,
    timer,
    remainingSeconds,
    standardResult,
    resultReason,
    resultPlayLog,
    resultShareText,
    canReturnToRoom,
    isRoomDissolved,
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
    debugAutoFollow,
    debugOwnerSeat,
    debugActorSeat,
    debugViewer,
    debugSwitchSource,
    debugCanSend,
    postRoom,
    resetDebugControl,
    run,
    send,
    sendPackageCommand,
    attachLatestRoom,
    autoProgressDebug,
    simulateDebugInputError,
    onToggleAutoFollow,
    onSelectActor,
    onSelectViewer,
    setMessage,
  } = props;

  if (playerAuthRequired) {
    return <PlayerAuthGate
      title={title}
      onAuthenticated={onPlayerAuthenticated}
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
              onClick={onCreateRoom}
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
                onClick={() => onJoinRoomByCode(joinCode)}
              >
                参加
              </button>
            </div>
            {message && <p className="mt-3 text-sm font-bold text-rose-700">{message}</p>}
          </div>
          <div className={panel}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">募集中の部屋</h2>
              <button type="button" className={secondary} onClick={onRefreshRooms}>更新</button>
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
                      onClick={() => onJoinRoomByCode(candidate.code)}
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
      <GameSdkDebugPanel
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
        room={room}
        common={common}
        moduleRequired={moduleRequired}
        supportsSpectators={supportsSpectators}
        debugAutoFollow={debugAutoFollow}
        debugOwnerSeat={debugOwnerSeat}
        debugActorSeat={debugActorSeat}
        debugViewer={debugViewer}
        debugSwitchSource={debugSwitchSource}
        pending={pending}
        message={message}
        run={run}
        send={send}
        autoProgressDebug={autoProgressDebug}
        simulateDebugInputError={simulateDebugInputError}
        onToggleAutoFollow={onToggleAutoFollow}
        onSelectActor={onSelectActor}
        onSelectViewer={onSelectViewer}
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
            onClick={onAbort}
          >
            中断
          </button>
        )}
      </GameSdkDebugPanel>
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
              <button type="button" className={`${primary} mt-4 w-full`} disabled={pending} onClick={onStart}>
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
                      プレイログ
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
              onReturnToRoom={onReturnToRoom}
              onDissolve={onDissolve}
              onLeave={onLeave}
              returnHref={backHref}
            />
          </div>
          <GameSdkLobbyPanel
            room={room}
            common={common}
            visible={room.phase === "lobby" && moduleRequired("room-settings")}
            settingDefinitions={settingDefinitions}
            pending={pending}
            defaultsEndpoint={defaultsEndpoint}
            onSaveDefaults={onSaveDefaults}
            setMessage={setMessage}
            run={run}
            send={send}
          />
          <GameSdkResultPanel
            room={room}
            title={title}
            gameId={gameId}
            creatorSlug={creatorSlug}
            backHref={backHref}
            supportsReplay={supportsReplay}
            usesLlm={usesLlm}
            moduleRequired={moduleRequired}
            resultShareText={resultShareText}
            resultReason={resultReason}
            feedbackEndpoint={feedbackEndpoint}
          />
        </aside>
        )}
        <div className={`min-w-0 overflow-hidden ${
          room.phase === "result" ? "order-1 lg:order-2" : "order-2"
        }`}>
          <GameSdkIframeBridge
            iframeRef={iframeRef}
            roomRef={roomRef}
            runtime={runtime}
            runtimeUrl={runtimeUrl}
            title={title}
            phase={room.phase}
            timer={timer}
            remainingSeconds={remainingSeconds}
            reducedTime={reducedTime}
            timerModuleRequired={moduleRequired("timer")}
            pending={pending}
            onRecoverTimeout={onRecoverTimeout}
            debugCanSend={debugCanSend}
            debugViewer={debugViewer}
            postRoom={postRoom}
            resetDebugControl={resetDebugControl}
            setMessage={setMessage}
            attachLatestRoom={attachLatestRoom}
            sendPackageCommand={sendPackageCommand}
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
