"use client";

import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { OnlineRoomLifecycleActions } from "@/app/components/OnlineRoomLifecycleActions";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import type { WordWolfSdkCommand } from "@/games/wordwolf-sdk/domain";
import type { WordWolfSdkAppView } from "@/games/wordwolf-sdk/server-module";
import {
  gameSdkSettingOptionValue,
  type GameSdkSettingDefinition,
  type GameSdkSettingValue,
} from "@game-fields/game-sdk";
import type {
  GameSdkOnlineRoomView,
} from "@game-fields/game-sdk/runtime";
import {
  createGameSdkHttpClientRuntime,
  GameSdkHttpClientRuntimeError,
} from "@game-fields/game-sdk/client-runtime";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WordWolfRoomView = GameSdkOnlineRoomView<
  {
    roundsTotal: number;
    wolfCount: number;
    clueMode: "turn" | "simultaneous";
    timeLimitSeconds: number;
  },
  WordWolfSdkAppView
>;

type RoomSnapshot = {
  code: string;
  revision: number;
  phase: string;
  view: WordWolfRoomView;
};

type Props = {
  gameId: string;
  title: string;
  settingDefinitions: readonly GameSdkSettingDefinition[];
  rules: readonly string[];
};

const panelClass =
  "rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-xl shadow-black/10";
const primaryClass =
  "rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-45";
const secondaryClass =
  "rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45";

function randomRoomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0]!.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

function runtimeErrorMessage(error: unknown) {
  if (error instanceof GameSdkHttpClientRuntimeError) {
    if (error.status === 401) return "ログインしてからもう一度お試しください。";
    if (error.code === "STALE_REVISION") return "部屋が更新されました。最新状態を読み直します。";
    if (error.code === "PLAYER_ACTIVE_ROOM") return "進行中の別の部屋があります。";
    return `操作を完了できませんでした（${error.code}）。`;
  }
  return "操作を完了できませんでした。";
}

export function ApprovedSdkGameShell({
  gameId,
  title,
  settingDefinitions,
  rules,
}: Props) {
  const runtime = useMemo(() => createGameSdkHttpClientRuntime<
    {
      settings?: Partial<WordWolfRoomView["common"]["settings"]>;
      app: { topic?: { villageWord: string; wolfWord: string } };
    },
    WordWolfSdkCommand,
    WordWolfRoomView
  >({
    gameId,
    endpoint: `/api/game-sdk/${gameId}/rooms`,
  }), [gameId]);
  const watchRef = useRef<{ close(): void } | null>(null);
  const expiryRef = useRef<number | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [rooms, setRooms] = useState<Array<{
    code: string;
    playerCount: number;
    maximumPlayers: number;
  }>>([]);
  const [joinCode, setJoinCode] = useState("");
  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [clockNow, setClockNow] = useState<number | null>(null);
  const [playerDefaults, setPlayerDefaults] = useState<
    Record<string, GameSdkSettingValue>
  >({});

  useEffect(() => {
    let active = true;
    void fetch(`/api/game-sdk/${gameId}/defaults`, {
      cache: "no-store",
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
  }, [gameId]);

  const refreshRooms = useCallback(async () => {
    try {
      const page = await runtime.listRooms();
      setRooms(page.rooms);
    } catch (error) {
      setMessage(runtimeErrorMessage(error));
    }
  }, [runtime]);

  const attachRoom = useCallback((next: RoomSnapshot | null) => {
    setRoom(next);
    watchRef.current?.close();
    watchRef.current = null;
    if (!next) return;
    watchRef.current = runtime.watchRoom(next.code, {
      onRoom: setRoom,
      onError: (error) => setMessage(runtimeErrorMessage(error)),
    });
  }, [runtime]);

  useEffect(() => {
    let active = true;
    void runtime.readActiveRoom()
      .then((next) => {
        if (!active) return;
        if (next) attachRoom(next);
        else void refreshRooms();
      })
      .catch((error) => {
        if (active) setMessage(runtimeErrorMessage(error));
      });
    return () => {
      active = false;
      watchRef.current?.close();
      if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    };
  }, [attachRoom, refreshRooms, runtime]);

  const run = useCallback(async (operation: () => Promise<RoomSnapshot>) => {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      attachRoom(await operation());
    } catch (error) {
      setMessage(runtimeErrorMessage(error));
      if (
        error instanceof GameSdkHttpClientRuntimeError
        && error.code === "STALE_REVISION"
        && room
      ) {
        attachRoom(await runtime.readRoom(room.code));
      }
    } finally {
      setPending(false);
    }
  }, [attachRoom, pending, room, runtime]);

  const send = useCallback(async (command: WordWolfSdkCommand) => {
    if (!room) throw new Error("ROOM_REQUIRED");
    const result = await runtime.sendCommand(room.code, {
      expectedRevision: room.revision,
      command,
    });
    return result.room;
  }, [room, runtime]);

  useEffect(() => {
    const deadlineAt = room?.view.common.timer?.deadlineAt;
    if (!deadlineAt || room?.phase === "result") return;
    const updateClock = () => {
      setClockNow(Date.now());
    };
    const initial = window.setTimeout(updateClock, 0);
    const interval = window.setInterval(updateClock, 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [room?.phase, room?.view.common.timer?.deadlineAt]);

  useEffect(() => {
    if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    expiryRef.current = null;
    const timer = room?.view.common.timer;
    if (!room || !timer?.deadlineAt || room.phase === "result") return;
    const delay = Math.max(0, timer.deadlineAt + 1_500 - Date.now());
    expiryRef.current = window.setTimeout(() => {
      void runtime.sendCommand(room.code, {
        expectedRevision: room.revision,
        command: {
          type: "room/expire-timer",
          turnSequence: timer.turnSequence,
        },
      }).then((result) => {
        setRoom(result.room);
      }).catch((error) => {
        if (
          error instanceof GameSdkHttpClientRuntimeError
          && (
            error.code === "STALE_REVISION"
            || error.code === "TIMER_EVENT_STALE"
            || error.code === "TIMER_NOT_EXPIRED"
          )
        ) return;
        setMessage(runtimeErrorMessage(error));
      });
    }, delay);
    return () => {
      if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    };
  }, [room, runtime]);

  const common = room?.view.common;
  const commonSettings = common?.settings as
    | Record<string, GameSdkSettingValue>
    | undefined;
  const app = room?.view.app;
  const self = common?.players.find((player) => player.isSelf);
  const timer = common?.timer;
  const remainingSeconds = timer?.deadlineAt && clockNow !== null
    ? Math.max(0, Math.ceil((timer.deadlineAt - clockNow) / 1000))
    : null;

  if (!room) {
    return (
      <main className={`min-h-screen bg-slate-950 px-4 py-10 text-white ${gameTopBannerOffsetClass}`}>
        <GameTopBanner eyebrow="SDK GAME" title={title}>
          <Link href="/games" className={secondaryClass}>ゲーム一覧へ</Link>
        </GameTopBanner>
        <section className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
          <div className={panelClass}>
            <h2 className="text-2xl font-black">新しい部屋</h2>
            <p className="mt-2 text-sm text-slate-600">
              認証・保存・同期はGame Fieldsの正式Room Runtimeを使用します。
            </p>
            <button
              type="button"
              className={`${primaryClass} mt-5 w-full`}
              disabled={pending}
              onClick={() => void run(() => runtime.createRoom({
                roomCode: randomRoomCode(),
                create: {
                  settings: playerDefaults,
                  app: {},
                },
              }))}
            >
              部屋を作る
            </button>
            <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={joinCode}
                maxLength={4}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                className="rounded-xl border border-slate-300 px-4 py-3 font-mono font-black"
                placeholder="部屋コード"
              />
              <button
                type="button"
                className={secondaryClass}
                disabled={pending || joinCode.trim().length !== 4}
                onClick={() => void run(async () => {
                  const current = await runtime.readRoom(joinCode);
                  if (!current) throw new Error("ROOM_NOT_FOUND");
                  return (await runtime.sendCommand(current.code, {
                    expectedRevision: current.revision,
                    command: { type: "room/join" },
                  })).room;
                })}
              >
                参加
              </button>
            </div>
            {message && <p className="mt-3 text-sm font-bold text-rose-700">{message}</p>}
          </div>
          <div className={panelClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-black">参加できる部屋</h2>
              <button type="button" className={secondaryClass} onClick={() => void refreshRooms()}>
                更新
              </button>
            </div>
            {rooms.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">現在、募集中の部屋はありません。</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {rooms.map((candidate) => (
                  <li key={candidate.code} className="flex items-center justify-between rounded-lg bg-slate-100 p-3">
                    <span className="font-mono font-black">{candidate.code}</span>
                    <span>{candidate.playerCount}/{candidate.maximumPlayers}人</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`min-h-screen bg-slate-950 px-4 py-8 text-white ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow={`ROOM ${room.code}`} title={title}>
        {common?.isHost && (
          <Link
            href={`/spectate/${encodeURIComponent(`sdk:${gameId}`)}/${room.code}`}
            className={secondaryClass}
          >
            観戦・共有
          </Link>
        )}
        <Link href="/games" className={secondaryClass}>ゲーム一覧へ</Link>
      </GameTopBanner>
      <section className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className={panelClass}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">{room.phase === "lobby" ? "ゲーム開始前" : room.phase === "result" ? "結果" : "プレイ中"}</h2>
              <span className="font-mono text-xs">rev {room.revision}</span>
            </div>
            <ul className="mt-4 space-y-2">
              {common?.players.map((player) => (
                <li key={player.seat} className="flex justify-between rounded-lg bg-slate-100 p-3 text-sm">
                  <strong>SEAT {player.seat + 1} · {player.displayName}{player.isSelf ? "（あなた）" : ""}</strong>
                  <span>
                    {player.reducedTime
                      ? "5秒制限"
                      : player.isDummy
                        ? "DUMMY"
                        : player.isHost
                          ? "HOST"
                          : ""}
                  </span>
                  {common.permissions.canDebug && player.isDummy && (
                    <button
                      type="button"
                      className="text-xs font-bold text-rose-700 underline"
                      onClick={() => void run(() => send({
                        type: "room/debug-remove-dummy",
                        seat: player.seat,
                      }))}
                    >
                      削除
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {common?.permissions.canDebug && (
              <button
                type="button"
                className={`${secondaryClass} mt-4 w-full`}
                disabled={pending || common.players.length >= common.maximumPlayers}
                onClick={() => void run(() => send({
                  type: "room/debug-add-dummy",
                }))}
              >
                DEBUG: ダミーを追加
              </button>
            )}
            {self?.reducedTime && (
              <button
                type="button"
                className={`${primaryClass} mt-4 w-full`}
                onClick={() => void run(() => send({ type: "room/recover-timeout" }))}
              >
                復帰して通常時間へ戻す
              </button>
            )}
          </div>
          <div className={panelClass}>
            <RoomConfigSummary
              title="現在の部屋設定"
              items={settingDefinitions.map((definition) => ({
                label: definition.label.ja,
                value: String(
                  commonSettings?.[definition.key]
                    ?? definition.defaultValue,
                ),
              }))}
            />
            {common?.permissions.canEditRoomSettings && (
              <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                {settingDefinitions.map((definition) => {
                  const value = commonSettings?.[definition.key]
                    ?? definition.defaultValue;
                  if (definition.type === "boolean") {
                    return (
                      <label key={definition.key} className="flex items-center justify-between gap-3 text-sm font-bold">
                        {definition.label.ja}
                        <input
                          type="checkbox"
                          checked={value === true}
                          onChange={(event) => void run(() => send({
                            type: "room/update-settings",
                            settings: {
                              [definition.key]: event.target.checked,
                            },
                          } as WordWolfSdkCommand))}
                        />
                      </label>
                    );
                  }
                  if (definition.type === "select" && definition.options) {
                    return (
                      <label key={definition.key} className="block text-sm font-bold">
                        {definition.label.ja}
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                          value={String(value)}
                          onChange={(event) => {
                            const selected = definition.options?.find(
                              (option) => String(gameSdkSettingOptionValue(option))
                                === event.target.value,
                            );
                            if (!selected) return;
                            void run(() => send({
                              type: "room/update-settings",
                              settings: {
                                [definition.key]: gameSdkSettingOptionValue(selected),
                              },
                            } as WordWolfSdkCommand));
                          }}
                        >
                          {definition.options.map((option) => {
                            const optionValue = gameSdkSettingOptionValue(option);
                            const label = typeof option === "object"
                              ? option.label.ja
                              : `${optionValue}${definition.unit?.ja ?? ""}`;
                            return (
                              <option key={String(optionValue)} value={String(optionValue)}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    );
                  }
                  return (
                    <label key={definition.key} className="block text-sm font-bold">
                      {definition.label.ja}
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        type={definition.type === "number" ? "number" : "text"}
                        value={String(value)}
                        min={definition.minimum}
                        max={definition.maximum}
                        onChange={(event) => {
                          const nextValue = definition.type === "number"
                            ? Number(event.target.value)
                            : event.target.value;
                          if (
                            definition.type === "number"
                            && !Number.isFinite(nextValue)
                          ) return;
                          void run(() => send({
                            type: "room/update-settings",
                            settings: {
                              [definition.key]: nextValue,
                            },
                          } as WordWolfSdkCommand));
                        }}
                      />
                    </label>
                  );
                })}
                <button
                  type="button"
                  className={`${secondaryClass} w-full`}
                  onClick={() => void fetch(
                    `/api/game-sdk/${gameId}/defaults`,
                    {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ settings: commonSettings }),
                    },
                  ).then(async (response) => {
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
              </div>
            )}
          </div>
          {rules.length > 0 && (
            <div className={panelClass}>
              <h2 className="text-lg font-black">ルール</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
                {rules.map((rule) => <li key={rule}>{rule}</li>)}
              </ol>
            </div>
          )}
          <OnlineRoomLifecycleActions
            surface={room.phase === "result" ? "result" : room.phase === "lobby" ? "lobby" : "playing"}
            isHost={common?.isHost === true}
            canReturnToRoom={room.phase === "result"}
            onReturnToRoom={room.phase === "result"
              ? () => void run(() => send({ type: "room/rematch" }))
              : undefined}
            onDissolve={room.phase === "lobby" || room.phase === "result"
              ? () => void (async () => {
                  await runtime.dissolveRoom(room.code);
                  attachRoom(null);
                  await refreshRooms();
                })()
              : undefined}
            returnHref="/games"
          />
        </aside>

        <section className={panelClass}>
          {timer && (
            <div className="mb-5 flex items-center justify-between rounded-lg bg-slate-950 px-4 py-3 text-white">
              <strong>残り時間</strong>
              <span className="font-mono text-xl font-black">
                {remainingSeconds === null ? "制限なし" : `${remainingSeconds}秒`}
              </span>
            </div>
          )}
          {room.phase === "lobby" && (
            <button
              type="button"
              className={`${primaryClass} w-full`}
              disabled={!common?.permissions.canStartGame || pending}
              onClick={() => void run(() => send({ type: "wordwolf/start" }))}
            >
              このメンバーで開始
            </button>
          )}
          {app?.myWord && (
            <div className="rounded-xl bg-cyan-50 p-5 text-center">
              <p className="text-xs font-bold text-cyan-700">あなたのお題</p>
              <strong className="mt-2 block text-3xl">{app.myWord}</strong>
            </div>
          )}
          {app?.actions.canSubmitClue && (
            <form className="mt-5 flex gap-2" onSubmit={(event) => {
              event.preventDefault();
              void run(() => send({ type: "wordwolf/submit-clue", text: clue }))
                .then(() => setClue(""));
            }}>
              <input value={clue} onChange={(event) => setClue(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3" placeholder="ヒント" />
              <button className={primaryClass} disabled={!clue.trim() || pending}>送信</button>
            </form>
          )}
          {app?.actions.canVote && (
            <div className="mt-5">
              <h3 className="font-black">怪しい人へ投票</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {common?.players.map((player) => (
                  <button
                    key={player.seat}
                    type="button"
                    className={secondaryClass}
                    onClick={() => void run(() => send({
                      type: "wordwolf/vote",
                      targetSeat: player.seat,
                    }))}
                  >
                    SEAT {player.seat + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
          {app?.actions.canGuess && (
            <form className="mt-5 flex gap-2" onSubmit={(event) => {
              event.preventDefault();
              void run(() => send({ type: "wordwolf/guess", answer: guess }))
                .then(() => setGuess(""));
            }}>
              <input value={guess} onChange={(event) => setGuess(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3" placeholder="村人のお題を回答" />
              <button className={primaryClass} disabled={!guess.trim() || pending}>回答</button>
            </form>
          )}
          {app && app.clues.length > 0 && (
            <ol className="mt-6 space-y-2">
              {app.clues.map((item, index) => (
                <li key={`${item.seat}-${item.round}-${index}`} className="rounded-lg bg-slate-100 p-3">
                  SEAT {item.seat + 1} · {item.text}
                </li>
              ))}
            </ol>
          )}
          {common?.standardResult && (
            <div className="mt-6">
              <h3 className="text-2xl font-black">ゲーム終了</h3>
              <ol className="mt-4 space-y-2">
                {common.standardResult.rankings.map((ranking) => (
                  <li key={ranking.seat} className="flex justify-between rounded-lg bg-slate-100 p-3">
                    <strong>{ranking.rank}位 · {ranking.displayName}</strong>
                    <span>{ranking.score}点</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {message && <p className="mt-4 text-sm font-bold text-rose-700">{message}</p>}
        </section>
      </section>
    </main>
  );
}
