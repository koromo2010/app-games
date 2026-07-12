"use client";

import { useEffect, useState } from "react";
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
  const [rating, setRating] = useState<GameFeedbackRating | null>(null);
  const [reasonTags, setReasonTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!props.artifactId || !props.playerId) return;
    const params = new URLSearchParams({ artifactId: props.artifactId, playerId: props.playerId });
    void fetch(`/api/game-feedback?${params.toString()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const feedback = data?.feedback;
        if (!feedback) return;
        setRating(feedback.rating === "good" || feedback.rating === "bad" ? feedback.rating : null);
        setReasonTags(Array.isArray(feedback.reasonTags) ? feedback.reasonTags : []);
        setComment(typeof feedback.comment === "string" ? feedback.comment : "");
      })
      .catch(() => undefined);
  }, [props.artifactId, props.playerId]);

  const selectRating = (nextRating: GameFeedbackRating) => {
    setRating(nextRating);
    setReasonTags((current) => current.filter((tag) => {
      const option = props.reasonOptions.find((item) => item.value === tag);
      return !option?.rating || option.rating === nextRating;
    }));
    setMessage("");
  };

  const toggleReason = (tag: string) => {
    setReasonTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
    setMessage("");
  };

  const save = async () => {
    if (!rating || !props.generation || !props.playerId) return;
    setIsSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/game-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactId: props.artifactId,
          artifactText: props.artifactText,
          game: props.game,
          task: props.task,
          rating,
          reasonTags,
          comment,
          playerId: props.playerId,
          generation: props.generation,
          settings: props.settings ?? {},
          outcome: props.outcome ?? {},
        }),
      });
      setMessage(response.ok ? "評価を保存しました。あとから変更できます。" : "評価を保存できませんでした。");
    } catch {
      setMessage("評価を保存できませんでした。");
    } finally {
      setIsSaving(false);
    }
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
          className={`rounded-lg border px-4 py-2 text-sm font-bold transition ${rating === "good" ? "border-emerald-500 bg-emerald-100 text-emerald-950" : "border-slate-300 bg-white text-slate-700"}`}
        >
          👍 Good
        </button>
        <button
          type="button"
          onClick={() => selectRating("bad")}
          className={`rounded-lg border px-4 py-2 text-sm font-bold transition ${rating === "bad" ? "border-rose-500 bg-rose-100 text-rose-950" : "border-slate-300 bg-white text-slate-700"}`}
        >
          👎 Bad
        </button>
      </div>
      {rating && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {visibleReasons.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleReason(option.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${reasonTags.includes(option.value) ? "border-cyan-500 bg-cyan-100 text-cyan-950" : "border-slate-300 bg-white text-slate-600"}`}
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
          <button
            type="button"
            onClick={() => void save()}
            disabled={isSaving || !props.generation || !props.playerId}
            className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            {isSaving ? "保存中..." : "評価を保存"}
          </button>
          {message && <p className="mt-2 text-sm font-semibold text-slate-700">{message}</p>}
        </>
      )}
    </div>
  );
}
