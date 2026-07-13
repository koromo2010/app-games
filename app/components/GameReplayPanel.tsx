"use client";

import { useCallback, useEffect, useState } from "react";
import {
  gameReplayMetadata,
  gameReplayShareText,
  type GameReplayDetail,
  type GameReplayListResponse,
  type GameReplaySummary,
} from "@/lib/game-replay-types";
import { shareGameResult } from "@/lib/game-share-client";

function formatReplayDate(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function GameReplayPanel() {
  const [data, setData] = useState<GameReplayListResponse | null>(null);
  const [selectedReplay, setSelectedReplay] = useState<GameReplayDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyReplayId, setBusyReplayId] = useState("");
  const [message, setMessage] = useState("");

  const loadReplays = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/player-replays?gameType=all", { cache: "no-store", signal });
      const next = (await response.json()) as GameReplayListResponse;
      if (!response.ok) throw new Error("REPLAY_LIST_FAILED");
      setData(next);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setData(null);
      setMessage("プレイバックを読み込めませんでした。");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/player-replays?gameType=all", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const next = (await response.json()) as GameReplayListResponse;
        if (!response.ok) throw new Error("REPLAY_LIST_FAILED");
        setData(next);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setData(null);
        setMessage("プレイバックを読み込めませんでした。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const openReplay = async (summary: GameReplaySummary) => {
    setBusyReplayId(summary.id);
    setMessage("");
    try {
      const response = await fetch(`/api/player-replays?id=${encodeURIComponent(summary.id)}`, { cache: "no-store" });
      const body = (await response.json()) as { replay?: GameReplayDetail };
      if (!response.ok || !body.replay) throw new Error("REPLAY_LOAD_FAILED");
      setSelectedReplay(body.replay);
    } catch {
      setMessage("このプレイバックを開けませんでした。期限切れの可能性があります。");
      await loadReplays();
    } finally {
      setBusyReplayId("");
    }
  };

  const toggleFavorite = async (replay: GameReplaySummary, favorite: boolean) => {
    setBusyReplayId(replay.id);
    setMessage("");
    try {
      const response = await fetch("/api/player-replays", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: replay.id, favorite }),
      });
      const body = (await response.json()) as { replay?: GameReplayDetail; error?: string };
      if (!response.ok) {
        if (response.status === 409) {
          setMessage(`お気に入りは最大${data?.policy.favoriteLimit ?? 10}件です。先に別の試合を外してください。`);
          return;
        }
        throw new Error(body.error || "REPLAY_FAVORITE_FAILED");
      }
      if (selectedReplay?.id === replay.id) setSelectedReplay(body.replay ?? null);
      await loadReplays();
      setMessage(favorite ? "お気に入りに保存しました。" : "お気に入りを解除しました。");
    } catch {
      setMessage("お気に入りを変更できませんでした。");
    } finally {
      setBusyReplayId("");
    }
  };

  const shareReplay = async (replay: GameReplaySummary) => {
    const text = gameReplayShareText(replay);
    const game = gameReplayMetadata[replay.gameType];
    const url = new URL(game.href, window.location.origin).toString();
    try {
      const outcome = await shareGameResult({ title: `Game Fields ${game.title} プレイバック`, text, url });
      if (outcome === "shared") setMessage("共有メニューを開きました。");
      if (outcome === "copied") setMessage("共有文をコピーしました。");
    } catch {
      setMessage("共有できませんでした。もう一度お試しください。");
    }
  };

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.96] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]" aria-labelledby="replay-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-violet-700">Playback</p>
          <h2 id="replay-heading" className="text-lg font-bold text-slate-950">全ゲームのプレイバック</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            通常{data?.policy.retentionDays ?? 30}日保存。お気に入りは期限なし・最大{data?.policy.favoriteLimit ?? 10}件です。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            void loadReplays();
          }}
          disabled={isLoading}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          更新
        </button>
      </div>

      {message && <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700" role="status">{message}</p>}

      {isLoading ? (
        <p className="mt-4 text-sm text-slate-500">読み込み中...</p>
      ) : data?.replays.length ? (
        <div className="mt-4 space-y-2">
          {data.replays.map((replay) => (
            <article key={replay.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-violet-700">{gameReplayMetadata[replay.gameType].title}</p>
                  <p className="truncate font-bold text-slate-900">{replay.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatReplayDate(replay.finishedAt)} / {replay.resultLabel} / {replay.playerCount}人
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {replay.favorite ? "お気に入り・期限なし" : `${formatReplayDate(replay.expiresAt)}まで`}
                  </p>
                  {replay.shareHighlights.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs leading-5 text-slate-600">
                      {replay.shareHighlights.slice(0, 3).map((highlight) => <li key={highlight}>・{highlight}</li>)}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={replay.favorite ? `${replay.title}をお気に入りから外す` : `${replay.title}をお気に入りにする`}
                  aria-pressed={replay.favorite}
                  disabled={busyReplayId === replay.id}
                  onClick={() => void toggleFavorite(replay, !replay.favorite)}
                  className={`rounded-md border px-2 py-1 text-sm transition disabled:opacity-50 ${replay.favorite ? "border-amber-300 bg-amber-100 text-amber-800" : "border-slate-300 bg-white text-slate-500 hover:bg-amber-50"}`}
                >
                  {replay.favorite ? "★" : "☆"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyReplayId === replay.id}
                  onClick={() => void openReplay(replay)}
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  詳細を見る
                </button>
                <button
                  type="button"
                  onClick={() => void shareReplay(replay)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                >
                  プレイバックを共有
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-slate-500">まだプレイバックはありません。今後完了した、デバッグ以外のゲームから記録されます。</p>
      )}

      {selectedReplay && (
        <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-violet-700">{gameReplayMetadata[selectedReplay.gameType].title} / PLAYBACK {selectedReplay.round}</p>
              <h3 className="text-lg font-black text-slate-950">{selectedReplay.title}</h3>
              {selectedReplay.gameType === "tahoiya" && selectedReplay.reading && <p className="text-xs text-slate-500">{selectedReplay.reading}</p>}
            </div>
            <button
              type="button"
              onClick={() => setSelectedReplay(null)}
              className="rounded-md border border-violet-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
            >
              閉じる
            </button>
          </div>

          {selectedReplay.gameType === "tahoiya" ? (
            <>
              <div className="mt-4 rounded-lg bg-white p-3">
                <p className="text-xs font-bold text-emerald-700">本当の説明</p>
                <p className="mt-1 text-sm leading-6 text-slate-800">{selectedReplay.realDefinition}</p>
              </div>

              <div className="mt-4 space-y-2">
                {selectedReplay.definitions.map((definition) => (
                  <div key={definition.id} className={`rounded-lg border p-3 ${definition.isReal ? "border-emerald-300 bg-emerald-50" : definition.isMine ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-700">
                        {definition.isReal ? "本物" : definition.isMine ? "あなたの説明" : `${definition.authorName ?? "Unknown"}の説明`}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">{definition.voteCount}票</p>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-800">{definition.text}</p>
                    {definition.voterNames.length > 0 && <p className="mt-1 text-[11px] text-slate-500">投票: {definition.voterNames.join("、")}</p>}
                    {selectedReplay.viewerVoteDefinitionId === definition.id && <p className="mt-1 text-[11px] font-bold text-violet-700">あなたが選んだ説明</p>}
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <p className="text-xs font-bold text-slate-600">得点</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedReplay.scores.map((score) => (
                    <span key={score.playerName} className={`rounded-md px-2 py-1 text-xs font-semibold ${score.isViewer ? "bg-cyan-100 text-cyan-800" : "bg-white text-slate-700"}`}>
                      {score.playerName} {score.points}点
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 rounded-lg bg-white p-3 text-sm font-bold text-slate-800">{selectedReplay.overview}</p>
              <div className="mt-4 space-y-2">
                {selectedReplay.highlights.map((highlight, index) => (
                  <p key={`${index}-${highlight}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700">{highlight}</p>
                ))}
              </div>
              <div className="mt-4">
                <p className="text-xs font-bold text-slate-600">プレイヤー</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedReplay.scores.map((score) => (
                    <span key={score.playerName} className={`rounded-md px-2 py-1 text-xs font-semibold ${score.isViewer ? "bg-cyan-100 text-cyan-800" : "bg-white text-slate-700"}`}>
                      {score.playerName} {score.scoreLabel}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
