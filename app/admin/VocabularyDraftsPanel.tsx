"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import type { VocabularyDraftSubmission } from "@/lib/vocabulary-admin-store";
import { LegacyVocabularyImportPanel } from "./LegacyVocabularyImportPanel";
import { TahoiyaCatalogMigrationPanel } from "./TahoiyaCatalogMigrationPanel";
import { VocabularyEvaluationsPanel } from "./VocabularyEvaluationsPanel";

function draftTitle(draft: VocabularyDraftSubmission) {
  const payload = draft.payload;
  if (draft.kind === "pair") return `${String(payload.villageWord ?? "?")} ／ ${String(payload.wolfWord ?? "?")}`;
  if (draft.kind === "definition") return String(payload.word ?? "語釈候補");
  return String(payload.surface ?? payload.theme ?? draft.kind);
}

export function VocabularyDraftsPanel({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [drafts, setDrafts] = useState<VocabularyDraftSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    const response = await fetch("/api/admin/vocabulary-drafts", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { drafts?: VocabularyDraftSubmission[]; error?: string } | null;
    if (response.status === 401) { onAuthExpired(); return; }
    if (!response.ok || !data?.drafts) { setMessage(data?.error ?? "候補を読み込めませんでした。"); setLoading(false); return; }
    setDrafts(data.drafts); setLoading(false);
  }, [onAuthExpired]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const review = async (draft: VocabularyDraftSubmission, decision: "active" | "rejected") => {
    if (reviewing) return;
    setReviewing(draft.id); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/vocabulary-drafts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, decision }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok) throw new Error(data?.error ?? "VOCABULARY_DRAFT_REVIEW_FAILED");
      setDrafts((current) => current.filter((entry) => entry.id !== draft.id));
      setMessage(decision === "active" ? "採用して本番抽出対象へ反映しました。" : "候補を却下しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "候補を更新できませんでした。");
    } finally { setReviewing(null); }
  };

  const removeReviewedDraft = useCallback((draftId: string) => {
    setDrafts((current) => current.filter((entry) => entry.id !== draftId));
  }, []);

  return <section className="mx-auto max-w-6xl px-4 py-8">
    <TahoiyaCatalogMigrationPanel onAuthExpired={onAuthExpired} />
    <LegacyVocabularyImportPanel onAuthExpired={onAuthExpired} />
    <VocabularyEvaluationsPanel onAuthExpired={onAuthExpired} onDraftReviewed={removeReviewedDraft} />
    <div className="mt-10 border-t border-white/10 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-black">単語候補レビュー</h2><p className="mt-1 text-sm text-slate-400">開発・生成バッチから届いたdraftです。現在はペアと語釈の採用に対応しています。</p></div><button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold disabled:opacity-40">再読込</button></div>
      {message && <p role="status" className="mt-4 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">{message}</p>}
      {loading ? <p className="mt-6 text-sm text-slate-400">読み込み中…</p> : drafts.length === 0 ? <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-400">未確認の候補はありません。</p> : <div className="mt-6 grid gap-4 lg:grid-cols-2">{drafts.map((draft) => {
        const supported = draft.kind === "pair" || draft.kind === "definition";
        return <article key={draft.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-cyan-300">{draft.kind} · {draft.sourceEnvironment}</p><h3 className="mt-1 text-xl font-black">{draftTitle(draft)}</h3></div><span className="rounded-md bg-white/10 px-2 py-1 text-xs text-slate-300">draft</span></div>
          {draft.kind === "pair" && <p className="mt-4 text-sm leading-6 text-slate-300">{String(draft.payload.reason ?? "説明なし")}</p>}
          {draft.kind === "definition" && <p className="mt-4 text-sm leading-6 text-slate-300">{String(draft.payload.realDefinition ?? "語釈なし")}</p>}
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400"><div><dt>生成元</dt><dd className="mt-1 text-slate-200">{draft.provider ?? draft.sourceType}</dd></div><div><dt>モデル</dt><dd className="mt-1 truncate text-slate-200">{draft.model ?? "—"}</dd></div></dl>
          <div className="mt-5 flex gap-2"><button type="button" disabled={!supported || Boolean(reviewing)} onClick={() => void review(draft, "active")} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-30">採用</button><button type="button" disabled={Boolean(reviewing)} onClick={() => void review(draft, "rejected")} className="rounded-lg border border-rose-300/30 px-4 py-2 text-sm font-bold text-rose-200 disabled:opacity-30">却下</button></div>
        </article>;
      })}</div>}
    </div>
  </section>;
}
