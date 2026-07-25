"use client";

import { useEffect, useState } from "react";
import type { GameSdkCapturedFeedbackArtifact } from "@/lib/game-sdk-feedback-store";
import { readPlayerSession } from "@/lib/player-session";
import { GameFeedbackPanel } from "./GameFeedbackPanel";

const reasonOptions = [
  { value: "accurate", label: "内容が適切", rating: "good" as const },
  { value: "clear", label: "わかりやすい", rating: "good" as const },
  { value: "fun", label: "ゲームが盛り上がった", rating: "good" as const },
  { value: "incorrect", label: "内容が誤っている", rating: "bad" as const },
  { value: "irrelevant", label: "質問・状況と合わない", rating: "bad" as const },
  { value: "confusing", label: "わかりにくい", rating: "bad" as const },
  { value: "repetitive", label: "同じ内容を繰り返す", rating: "bad" as const },
  { value: "inappropriate", label: "不適切な内容", rating: "bad" as const },
  { value: "other", label: "その他" },
];

export function GameSdkFeedbackPanel({
  endpoint,
  roomCode,
  resultReason,
}: {
  endpoint: string;
  roomCode: string;
  resultReason: string;
}) {
  const [artifacts, setArtifacts] = useState<GameSdkCapturedFeedbackArtifact[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [playerId, setPlayerId] = useState("");

  useEffect(() => {
    const refresh = () => setPlayerId(readPlayerSession()?.id ?? "");
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener("game-fields:player-session-saved", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("game-fields:player-session-saved", refresh);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set("roomCode", roomCode);
    void fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as {
        artifacts?: GameSdkCapturedFeedbackArtifact[];
      };
      if (!controller.signal.aborted && Array.isArray(body.artifacts)) {
        setArtifacts(body.artifacts);
      }
    }).catch(() => undefined).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [endpoint, roomCode]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
        AI生成物のフィードバック対象を確認中...
      </div>
    );
  }
  if (!playerId || artifacts.length === 0) return null;

  return (
    <div className="space-y-4">
      {artifacts.map((artifact, index) => (
        <div
          key={artifact.artifactId}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-xl shadow-black/10"
        >
          <p className="text-xs font-black uppercase tracking-wide text-cyan-700">
            AI生成 {artifacts.length - index} · {artifact.task}
          </p>
          <p className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-sm leading-6 text-slate-700">
            {artifact.artifactText}
          </p>
          <GameFeedbackPanel
            artifactId={artifact.artifactId}
            artifactText={artifact.artifactText}
            game={artifact.game}
            task={artifact.task}
            playerId={playerId}
            generation={artifact.generation}
            reasonOptions={reasonOptions}
            outcome={{ resultReason }}
            heading="このAI生成内容はどうでしたか？"
          />
        </div>
      ))}
    </div>
  );
}
