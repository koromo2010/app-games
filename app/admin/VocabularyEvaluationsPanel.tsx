"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import type { VocabularyWordGameEvaluation } from "@/lib/vocabulary-admin-store";
import type { VocabularyEvaluationDecision } from "@/lib/vocabulary-review";

type Filter = "all" | VocabularyEvaluationDecision;
type VoteResult = {
  evaluationId: string;
  decision: VocabularyEvaluationDecision;
  humanAcceptCount: number;
  humanRejectCount: number;
  comment: string | null;
};
type DraftReviewResult = { id: string; status: "active"; subjectId: string | null };

const decisionLabels = { accept: "OK", reject: "reject" } as const;
const distanceLabels: Record<string, string> = { near: "近い", balanced: "普通", wide: "遠い" };
const evaluationDateFormatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" });

function decisionClass(decision: VocabularyEvaluationDecision) {
  return decision === "accept" ? "bg-emerald-300/15 text-emerald-200" : "bg-rose-300/15 text-rose-200";
}

export function VocabularyEvaluationsPanel({ onAuthExpired, onDraftAdopted }: {
  onAuthExpired: () => void;
  onDraftAdopted: (draftId: string) => void;
}) {
  const [evaluations, setEvaluations] = useState<VocabularyWordGameEvaluation[]>([]);
  const [votingEnabled, setVotingEnabled] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    const response = await fetch("/api/admin/vocabulary-evaluations", { cache: "no-store" });
    const data = await response.json().catch(() => null) as {
      evaluations?: VocabularyWordGameEvaluation[]; votingEnabled?: boolean; error?: string;
    } | null;
    if (response.status === 401) { onAuthExpired(); return; }
    if (!response.ok || !data?.evaluations) {
      setMessage(data?.error ?? "LLM評価を読み込めませんでした。"); setLoading(false); return;
    }
    setEvaluations(data.evaluations);
    setComments(Object.fromEntries(data.evaluations.map((evaluation) => [evaluation.id, evaluation.myComment ?? ""])));
    setVotingEnabled(Boolean(data.votingEnabled)); setLoading(false);
  }, [onAuthExpired]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => ({
    all: evaluations.length,
    accept: evaluations.filter((evaluation) => evaluation.llmDecision === "accept").length,
    reject: evaluations.filter((evaluation) => evaluation.llmDecision === "reject").length,
  }), [evaluations]);
  const visibleEvaluations = useMemo(() => filter === "all"
    ? evaluations
    : evaluations.filter((evaluation) => evaluation.llmDecision === filter), [evaluations, filter]);

  const vote = async (evaluation: VocabularyWordGameEvaluation, decision: VocabularyEvaluationDecision) => {
    if (voting || !votingEnabled) return;
    setVoting(evaluation.id); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/vocabulary-evaluations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationId: evaluation.id, decision, comment: comments[evaluation.id] ?? "" }),
      });
      const data = await response.json().catch(() => null) as { result?: VoteResult; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.result) throw new Error(data?.error ?? "VOCABULARY_EVALUATION_VOTE_FAILED");
      const result = data.result;
      setEvaluations((current) => current.map((entry) => entry.id === result.evaluationId ? {
        ...entry,
        myVote: result.decision,
        myComment: result.comment,
        humanAcceptCount: result.humanAcceptCount,
        humanRejectCount: result.humanRejectCount,
        resolvedDecision: result.humanAcceptCount > result.humanRejectCount ? "accept"
          : result.humanRejectCount > result.humanAcceptCount ? "reject" : entry.llmDecision,
      } : entry));
      setMessage(`${decisionLabels[decision]}に投票しました。管理者票を残し、本番RAGのお題評価にも1票として反映します。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "投票を保存できませんでした。");
    } finally { setVoting(null); }
  };

  const formallyAdopt = async (evaluation: VocabularyWordGameEvaluation) => {
    if (adopting || !evaluation.linkedDraftId || evaluation.linkedDraftStatus !== "draft") return;
    const confirmed = window.confirm(`${evaluation.word} ／ ${evaluation.partnerText ?? "?"} を正式採用し、本番の出題対象へ反映します。よろしいですか？`);
    if (!confirmed) return;
    setAdopting(evaluation.id); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/vocabulary-drafts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: evaluation.linkedDraftId, decision: "active" }),
      });
      const data = await response.json().catch(() => null) as { result?: DraftReviewResult; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.result) throw new Error(data?.error ?? "VOCABULARY_DRAFT_REVIEW_FAILED");
      const result = data.result;
      setEvaluations((current) => current.map((entry) => entry.linkedDraftId === result.id ? {
        ...entry,
        linkedDraftStatus: "active",
        materializedPairId: result.subjectId,
      } : entry));
      onDraftAdopted(result.id);
      setMessage("正式採用して、共通DBの本番出題対象へ反映しました。投票内容は変更していません。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "正式採用できませんでした。");
    } finally { setAdopting(null); }
  };

  return <section className="mt-10 border-t border-white/10 pt-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-2xl font-black">LLM評価レビュー</h2><p className="mt-1 text-sm leading-6 text-slate-400">直近100件のOK・rejectを表示します。管理者票は本番RAGの「お題評価」に1票として反映します。完全なペア候補は、この一覧から正式採用して本番出題対象へ反映できます。</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold disabled:opacity-40">再読込</button>
    </div>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="LLM評価の絞り込み">
      {(["all", "accept", "reject"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-2 text-sm font-bold ${filter === value ? "bg-cyan-300 text-slate-950" : "border border-white/15 text-slate-300"}`}>{value === "all" ? "すべて" : decisionLabels[value]} {counts[value]}</button>)}
    </div>
    {!votingEnabled && !loading && <p role="status" className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">rejectを含む評価の閲覧はできます。投票を有効にするには、共通単語DBへ <code className="font-mono">005_human_review_votes.sql</code> を適用してください。</p>}
    {message && <p role="status" className="mt-4 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">{message}</p>}
    {loading ? <p className="mt-6 text-sm text-slate-400">読み込み中…</p> : visibleEvaluations.length === 0 ? <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-400">該当するLLM評価はありません。</p> : <div className="mt-6 grid gap-4 lg:grid-cols-2">{visibleEvaluations.map((evaluation) => <article key={evaluation.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-cyan-300">{distanceLabels[evaluation.pairDistance ?? ""] ?? evaluation.pairDistance ?? "距離未設定"} · {evaluation.provider ?? "LLM"}</p><h3 className="mt-1 text-xl font-black">{evaluation.word} ／ {evaluation.partnerText ?? "相方未生成"}</h3></div><span className={`rounded-md px-2 py-1 text-xs font-bold ${decisionClass(evaluation.llmDecision)}`}>LLM {decisionLabels[evaluation.llmDecision]}</span></div>
      <p className="mt-4 text-sm leading-6 text-slate-300">{evaluation.pairReason || "判定理由なし"}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400"><div><dt>理由コード</dt><dd className="mt-1 break-words text-slate-200">{evaluation.reasonCode}</dd></div><div><dt>モデル</dt><dd className="mt-1 break-words text-slate-200">{evaluation.model ?? "—"}</dd></div><div><dt>実質Zipf補正</dt><dd className="mt-1 text-slate-200">{(evaluation.usagePenalty + evaluation.gamePenalty - evaluation.feedbackAdjustment).toFixed(2)}</dd></div><div><dt>評価日時</dt><dd className="mt-1 text-slate-200">{evaluationDateFormatter.format(new Date(evaluation.createdAt))}</dd></div></dl>
      {evaluation.safetyFlags.length > 0 && <p className="mt-3 text-xs text-amber-200">フラグ：{evaluation.safetyFlags.join(" / ")}</p>}
      <div className="mt-5 rounded-xl bg-black/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-bold">管理者票：OK {evaluation.humanAcceptCount} ／ NG {evaluation.humanRejectCount}</span><span className={`rounded-md px-2 py-1 text-xs font-bold ${decisionClass(evaluation.resolvedDecision)}`}>総合 {decisionLabels[evaluation.resolvedDecision]}</span></div><p className="mt-2 text-xs text-slate-400">自分の票：{evaluation.myVote ? decisionLabels[evaluation.myVote] : "未投票"}</p></div>
      <label className="mt-4 block text-xs font-bold text-slate-300">自由記述（任意・500文字まで）<textarea value={comments[evaluation.id] ?? ""} maxLength={500} rows={3} onChange={(event) => setComments((current) => ({ ...current, [evaluation.id]: event.target.value }))} placeholder="このお題をOK／NGと考えた理由。将来の傾向分析用に保存します。" className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm font-normal leading-6 text-white outline-none focus:border-cyan-300" /><span className="mt-1 block text-right font-normal text-slate-500">{(comments[evaluation.id] ?? "").length}/500</span></label>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!votingEnabled || Boolean(voting) || Boolean(adopting)} aria-pressed={evaluation.myVote === "accept"} onClick={() => void vote(evaluation, "accept")} className={`rounded-lg px-4 py-2 text-sm font-black disabled:opacity-30 ${evaluation.myVote === "accept" ? "bg-emerald-200 text-slate-950" : "border border-emerald-300/30 text-emerald-200"}`}>OKに投票</button><button type="button" disabled={!votingEnabled || Boolean(voting) || Boolean(adopting)} aria-pressed={evaluation.myVote === "reject"} onClick={() => void vote(evaluation, "reject")} className={`rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-30 ${evaluation.myVote === "reject" ? "bg-rose-200 text-slate-950" : "border border-rose-300/30 text-rose-200"}`}>NGに投票</button><button type="button" disabled={!evaluation.linkedDraftId || evaluation.linkedDraftStatus !== "draft" || Boolean(voting) || Boolean(adopting)} onClick={() => void formallyAdopt(evaluation)} className={`rounded-lg px-4 py-2 text-sm font-black disabled:opacity-50 ${evaluation.linkedDraftStatus === "active" ? "border border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "bg-cyan-300 text-slate-950"}`}>{evaluation.linkedDraftStatus === "active" ? "正式採用済み" : adopting === evaluation.id ? "正式採用中…" : "正式採用"}</button></div>
      {evaluation.linkedDraftStatus === "rejected" && <p className="mt-3 text-xs leading-5 text-rose-200">このペア候補は候補レビューで却下済みです。</p>}
      {!evaluation.linkedDraftId && evaluation.partnerText && <p className="mt-3 text-xs leading-5 text-slate-500">この評価は正式なペア候補として保存されていないため、正式採用できません。</p>}
      {!evaluation.partnerText && <p className="mt-3 text-xs leading-5 text-slate-500">相方未生成のrejectへOK投票した場合、この親単語を次回生成で再試行できるようにします。</p>}
    </article>)}</div>}
  </section>;
}
