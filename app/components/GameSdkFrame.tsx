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
import { GameSdkShellHeader } from "@/app/components/GameSdkShellHeader";
import { GameSdkFeedbackPanel } from "@/app/components/GameSdkFeedbackPanel";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { AppLink as Link } from "@/app/components/AppLink";
import { gameTopBannerActionClass } from "@/app/components/GameTopMenu";
import { useGameSdkActiveRoomRestore } from "@/app/hooks/use-game-sdk-active-room-restore";
import { withAiActivity } from "@/lib/ai-activity-client";
import {
  gameSdkResultHighlights,
  gameSdkResultPlayLog,
  gameSdkResultReasonText,
} from "@/lib/game-sdk-result-presentation";
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
    isHost: boolean;
    isSelf: boolean;
    isDummy: boolean;
  }>;
  settings: Record<string, GameSdkSettingValue>;
  minimumPlayers: number;
  maximumPlayers: number;
  isHost: boolean;
  permissions: {
    canStartGame: boolean;
    canEditRoomSettings: boolean;
    canAbort: boolean;
    canDebug: boolean;
  };
  timer?: {
    deadlineAt: number | null;
    turnSequence: number;
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

function errorMessage(error: unknown) {
  if (error instanceof GameSdkHttpClientRuntimeError) {
    if (error.status === 401) return "Preview認証を更新してください。";
    if (error.code === "STALE_REVISION") return "部屋を最新状態へ更新しました。";
    return `操作を完了できませんでした（${error.code}）。`;
  }
  return "操作を完了できませんでした。";
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
  usesLlm,
}: Props) {
  const { locale } = useAppLocale();
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
  const roomRef = useRef<PackageRoom | null>(null);
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
  const moduleRequired = useCallback((id: GameSdkModuleId) => (
    moduleProfile[id].mode === "required"
  ), [moduleProfile]);

  const postRoom = useCallback((next: PackageRoom | null) => {
    iframeRef.current?.contentWindow?.postMessage({
      type: "game-fields:room-snapshot",
      room: next,
    }, "*");
  }, []);

  const commitRoom = useCallback((next: PackageRoom | null) => {
    roomRef.current = next;
    setRoom(next);
    postRoom(next);
  }, [postRoom]);

  const attachRoom = useCallback((next: PackageRoom | null) => {
    watchRef.current?.close();
    watchRef.current = null;
    commitRoom(next);
    if (!next) return;
    watchRef.current = runtime.watchRoom(next.code, {
      onRoom: (incoming) => {
        const current = roomRef.current;
        if (
          incoming
          && current
          && incoming.code === current.code
          && incoming.revision <= current.revision
        ) return;
        commitRoom(incoming);
      },
      onError: (error) => setMessage(errorMessage(error)),
    });
  }, [commitRoom, runtime]);

  const refreshRooms = useCallback(async () => {
    try {
      const page = await runtime.listRooms();
      setRooms(page.rooms);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [runtime]);

  const loadActiveRoom = useCallback(
    () => runtime.readActiveRoom(),
    [runtime],
  );
  const handleRestoreError = useCallback((error: unknown) => {
    setMessage(errorMessage(error));
  }, []);
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
    if (pending) return null;
    setPending(true);
    setMessage("");
    try {
      const next = await operation();
      attachRoom(next);
      return next;
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
      setMessage(errorMessage(error));
      if (
        error instanceof GameSdkHttpClientRuntimeError
        && error.code === "STALE_REVISION"
        && roomRef.current
      ) {
        attachRoom(await runtime.readRoom(roomRef.current.code));
      }
      return null;
    } finally {
      setPending(false);
    }
  }, [attachRoom, pending, runtime]);

  const send = useCallback(async (command: SafeCommand) => {
    const current = roomRef.current;
    if (!current) throw new Error("ROOM_REQUIRED");
    const operation = async () => (await runtime.sendCommand(current.code, {
      expectedRevision: current.revision,
      command,
    })).room;
    return usesLlm && moduleRequired("ai-activity")
      ? withAiActivity("SDKゲームのAI処理", operation)
      : operation();
  }, [moduleRequired, runtime, usesLlm]);

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
      void send(payload.command).then((next) => {
        attachRoom(next);
        iframeRef.current?.contentWindow?.postMessage({
          type: "game-fields:room-command-result",
          requestId: payload.requestId,
          room: next,
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
  }, [attachRoom, postRoom, send]);

  useEffect(() => {
    if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    expiryRef.current = null;
    const timer = room?.view.common.timer;
    if (!room || room.phase === "result" || !timer?.deadlineAt) return;
    expiryRef.current = window.setTimeout(() => {
      void send({
        type: "room/expire-timer",
        turnSequence: timer.turnSequence,
      }).then(attachRoom).catch(() => undefined);
    }, Math.max(0, timer.deadlineAt + 1_500 - Date.now()));
    return () => {
      if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    };
  }, [attachRoom, room, send]);

  const defaultSettings = Object.fromEntries(
    settingDefinitions.map((definition) => [
      definition.key,
      definition.defaultValue,
    ]),
  );
  const common = room?.view.common;
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

  if (!room) {
    return (
      <main className={`min-h-screen bg-slate-950 px-4 py-10 text-white ${gameTopBannerOffsetClass}`}>
        <GameSdkShellHeader
          eyebrow="SDK PACKAGE"
          title={title}
          rules={rules}
          backHref={backHref}
          backLabel={creatorSlug ? "制作者ページへ" : "ゲーム広場へ戻る"}
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
                onClick={() => void run(async () => {
                  const target = await runtime.readRoom(joinCode);
                  if (!target) throw new Error("ROOM_NOT_FOUND");
                  return (await runtime.sendCommand(target.code, {
                    expectedRevision: target.revision,
                    command: { type: "room/join" },
                  })).room;
                })}
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
                  <li key={candidate.code} className="flex justify-between rounded-lg bg-slate-100 p-3">
                    <strong className="font-mono">{candidate.code}</strong>
                    <span>{candidate.playerCount}/{candidate.maximumPlayers}人</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
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
        backLabel={creatorSlug ? "制作者ページへ" : "ゲーム広場へ戻る"}
      >
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
            {common?.isHost && room.phase === "result" && (
              <button type="button" className={`${primary} mt-3 w-full`} disabled={pending} onClick={() => void run(() => send({ type: "room/rematch" }))}>
                再戦
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
          </div>
          {room.phase === "lobby" && (
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
          <iframe
            ref={iframeRef}
            src={runtimeUrl}
            title={`${title} game package`}
            sandbox="allow-scripts allow-modals allow-pointer-lock"
            className="block w-full border-0"
            style={{ height: frameHeight }}
            onLoad={() => postRoom(roomRef.current)}
          />
        </div>
      </section>
    </main>
  );
}
