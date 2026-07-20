"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameFeedbackRating, GameGenerationMeta } from "@/lib/game-ai-types";

type ReasonOption = { value: string; label: string; rating?: GameFeedbackRating };

type GameFeedbackPanelProps = {
  artifactId: string;
  artifactText: string;
  game: string;
  task: string;
  playerId: string;
  generation?: GameGenerationMeta;
  reasonOptions: ReasonOption[];
  settings?: Record<string, string | number | boolean>;
  outcome?: Record<string, string | number | boolean>;
};

export function GameFeedbackPanel(props: GameFeedbackPanelProps) {
  return <GameFeedbackPanelContent key={`${props.artifactId}:${props.playerId}`} {...props} />;
}

function GameFeedbackPanelContent(props: GameFeedbackPanelProps) {
  const [rating, setRating] = useState<GameFeedbackRating | null>(null);
  const [reasonTags, setReasonTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [savedComment, setSavedComment] = useState("");
  const [message, setMessage] = useState("");
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const savedCommentRef = useRef("");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestSaveIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    if (!props.artifactId || !props.playerId) {
      const timer = window.setTimeout(() => setIsFeedbackLoading(false), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ artifactId: props.artifactId, playerId: props.playerId });
    void fetch(`/api/game-feedback?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        const feedback = data?.feedback;
        if (!feedback || controller.signal.aborted) return;
        setRating(feedback.rating === "good" || feedback.rating === "bad" ? feedback.rating : null);
        setReasonTags(Array.isArray(feedback.reasonTags) ? feedback.reasonTags : []);
        const savedComment = typeof feedback.comment === "string" ? feedback.comment : "";
        savedCommentRef.current = savedComment;
        setSavedComment(savedComment);
        setComment(savedComment);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setIsFeedbackLoading(false);
      });
    return () => controller.abort();
  }, [props.artifactId, props.playerId]);

  const persistFeedback = useCallback((nextRating: GameFeedbackRating, nextReasonTags: string[], nextComment: string, mode: "selection" | "comment") => {
    if (!props.generation || !props.playerId) return;
    const saveId = ++latestSaveIdRef.current;
    setIsSaving(true);
    setMessage(mode === "selection" ? "選択内容を自動保存中..." : "自由記述を保存中...");
    const request = saveQueueRef.current.then(async () => {
      const payload = {
        artifactId: props.artifactId,
        artifactText: props.artifactText,
        game: props.game,
        task: props.task,
        rating: nextRating,
        reasonTags: nextReasonTags,
        comment: mode === "selection" ? savedCommentRef.current : nextComment,
        playerId: props.playerId,
        generation: props.generation,
        settings: props.settings ?? {},
        outcome: props.outcome ?? {},
      };
      const response = await fetch("/api/game-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("FEEDBACK_SAVE_FAILED");
      if (mode === "comment") {
        savedCommentRef.current = nextComment;
        if (mountedRef.current) setSavedComment(nextComment);
      }
    });
    saveQueueRef.current = request.catch(() => undefined);
    void request
      .then(() => {
        if (!mountedRef.current || latestSaveIdRef.current !== saveId) return;
        setMessage(mode === "selection" ? "選択内容を自動保存しました。" : "自由記述を保存しました。");
      })
      .catch(() => {
        if (!mountedRef.current || latestSaveIdRef.current !== saveId) return;
        setMessage("評価を保存できませんでした。もう一度お試しください。");
      })
      .finally(() => {
        if (mountedRef.current && latestSaveIdRef.current === saveId) setIsSaving(false);
      });
  }, [props.artifactId, props.artifactText, props.game, props.generation, props.outcome, props.playerId, props.settings, props.task]);

  const selectRating = (nextRating: GameFeedbackRating) => {
    if (isFeedbackLoading) return;
    const nextReasonTags = reasonTags.filter((tag) => {
      const option = props.reasonOptions.find((item) => item.value === tag);
      return !option?.rating || option.rating === nextRating;
    });
    setRating(nextRating);
    setReasonTags(nextReasonTags);
    persistFeedback(nextRating, nextReasonTags, savedCommentRef.current, "selection");
  };

  const toggleReason = (tag: string) => {
    if (!rating || isFeedbackLoading) return;
    const nextReasonTags = reasonTags.includes(tag) ? reasonTags.filter((item) => item !== tag) : [...reasonTags, tag];
    setReasonTags(nextReasonTags);
    persistFeedback(rating, nextReasonTags, savedCommentRef.current, "selection");
  };

  const saveComment = () => {
    if (!rating) return;
    persistFeedback(rating, reasonTags, comment, "comment");
  };

  const visibleReasons = rating
    ? props.reasonOptions.filter((option) => !option.rating || option.rating === rating)
    : [];

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">Feedback</p>
      <h3 className="mt-1 text-base font-black text-slate-950">今回のお題はどうでしたか？</h3>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => selectRating("good")}
          disabled={isFeedbackLoading || !props.generation || !props.playerId}
          aria-pressed={rating === "good"}
          className={`rounded-lg border px-4 py-2 text-sm font-bold transition disabled:cursor-wait disabled:opacity-50 ${rating === "good" ? "border-emerald-500 bg-emerald-100 text-emerald-950" : "border-slate-300 bg-white text-slate-700"}`}
        >
          👍 Good
        </button>
        <button
          type="button"
          onClick={() => selectRating("bad")}
          disabled={isFeedbackLoading || !props.generation || !props.playerId}
          aria-pressed={rating === "bad"}
          className={`rounded-lg border px-4 py-2 text-sm font-bold transition disabled:cursor-wait disabled:opacity-50 ${rating === "bad" ? "border-rose-500 bg-rose-100 text-rose-950" : "border-slate-300 bg-white text-slate-700"}`}
        >
          👎 Bad
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{isFeedbackLoading ? "保存済みの評価を確認中..." : "Good／Badと理由は、押した時点で自動保存されます。"}</p>
      {rating && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {visibleReasons.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleReason(option.value)}
                disabled={isFeedbackLoading}
                aria-pressed={reasonTags.includes(option.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-50 ${reasonTags.includes(option.value) ? "border-cyan-500 bg-cyan-100 text-cyan-950" : "border-slate-300 bg-white text-slate-600"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="mt-3 min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500"
            placeholder="自由記述（任意）"
            maxLength={800}
          />
          {comment !== savedComment && <p className="mt-1 text-xs font-semibold text-amber-700">自由記述はまだ保存されていません。</p>}
          <button
            type="button"
            onClick={saveComment}
            disabled={isSaving || !props.generation || !props.playerId || comment === savedComment}
            className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            {isSaving ? "保存中..." : comment === savedComment ? "自由記述は保存済み" : "自由記述を保存"}
          </button>
          {message && <p className="mt-2 text-sm font-semibold text-slate-700" role="status">{message}</p>}
        </>
      )}
    </div>
  );
}
