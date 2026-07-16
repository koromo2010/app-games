"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminHyperparameterCatalog,
  HyperparameterControl,
  HyperparameterOrigin,
} from "@/lib/admin-hyperparameters";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";

const originStyles: Record<HyperparameterOrigin, string> = {
  "過去指定": "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100",
  "コード抽出": "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  "追加候補": "border-amber-300/30 bg-amber-300/10 text-amber-100",
};

const controlStyles: Record<HyperparameterControl, string> = {
  "環境変数": "text-emerald-200",
  "部屋設定": "text-sky-200",
  "固定値": "text-slate-300",
  "未実装": "text-amber-200",
  "派生値": "text-violet-200",
};

export function AdminHyperparametersPanel({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [catalog, setCatalog] = useState<AdminHyperparameterCatalog | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/hyperparameters", { cache: "no-store" });
      const data = await response.json().catch(() => null) as { catalog?: AdminHyperparameterCatalog; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.catalog) throw new Error(data?.error || "LOAD_FAILED");
      setCatalog(data.catalog);
      setDrafts(Object.fromEntries(data.catalog.groups.flatMap((group) => group.items).flatMap((item) => item.editor ? [[item.id, String(item.editor.value)]] : [])));
      setMessage("");
    } catch {
      setMessage("ハイパラ一覧を読み込めませんでした。");
    } finally {
      setIsLoading(false);
    }
  }, [onAuthExpired]);

  const saveEntry = async (id: string, value: number | null) => {
    if (savingId) return;
    setSavingId(id); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/hyperparameters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: { [id]: value } }),
      });
      const data = await response.json().catch(() => null) as { catalog?: AdminHyperparameterCatalog; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.catalog) throw new Error(data?.error || "SAVE_FAILED");
      setCatalog(data.catalog);
      setDrafts(Object.fromEntries(data.catalog.groups.flatMap((group) => group.items).flatMap((item) => item.editor ? [[item.id, String(item.editor.value)]] : [])));
      setMessage(value === null ? "コードまたは環境変数の既定値へ戻しました。" : "ハイパラを保存しました。");
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_AUTH_REQUIRED") onAuthExpired();
      setMessage("ハイパラを保存できませんでした。入力範囲と本人確認を確かめてください。");
    } finally {
      setSavingId(null);
    }
  };

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const filteredGroups = useMemo(() => {
    if (!catalog) return [];
    const normalized = query.trim().toLocaleLowerCase("ja-JP");
    if (!normalized) return catalog.groups;
    return catalog.groups.flatMap((group) => {
      const groupMatches = `${group.title} ${group.summary}`.toLocaleLowerCase("ja-JP").includes(normalized);
      const items = groupMatches ? group.items : group.items.filter((item) =>
        [item.label, item.currentValue, item.recommendedValue, item.note, item.source, item.origin, item.control]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("ja-JP")
          .includes(normalized),
      );
      return items.length ? [{ ...group, items }] : [];
    });
  }, [catalog, query]);

  const totals = useMemo(() => {
    const items = catalog?.groups.flatMap((group) => group.items) ?? [];
    return {
      all: items.length,
      specified: items.filter((item) => item.origin === "過去指定").length,
      candidates: items.filter((item) => item.origin === "追加候補").length,
      planned: items.filter((item) => item.control === "未実装").length,
      editable: items.filter((item) => item.editor).length,
    };
  }, [catalog]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">ハイパラ管理</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">安全範囲が決まっている値はここから変更できます。技術上限、部屋ごとの設定、未実装項目は引き続き閲覧専用です。</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={isLoading} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/10 disabled:opacity-40">{isLoading ? "更新中…" : "値を再取得"}</button>
      </div>

      {message && <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{message}</p>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="掲載項目" value={totals.all} note="全体＋ゲーム別" />
        <SummaryCard label="過去に明示" value={totals.specified} note="会話・仕様で指定済み" />
        <SummaryCard label="追加候補" value={totals.candidates} note="コードから新たに抽出" />
        <SummaryCard label="編集可能" value={totals.editable} note="再認証・監査ログ付き" />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="text-sm font-bold text-slate-200">項目を検索
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例：クールダウン、得点、人数、Zipf" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-300" />
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            {(Object.keys(originStyles) as HyperparameterOrigin[]).map((origin) => <span key={origin} className={`rounded-full border px-2.5 py-1 font-bold ${originStyles[origin]}`}>{origin}</span>)}
          </div>
        </div>
      </section>

      {isLoading && !catalog ? <p className="py-16 text-center text-sm font-bold text-cyan-200 animate-pulse">ハイパラを棚卸し中…</p> :
        <div className="space-y-4">{filteredGroups.map((group) => (
          <details key={group.id} open={Boolean(query.trim()) || undefined} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]" {...(!query.trim() ? { defaultOpen: group.kind === "common" } : {})}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden hover:bg-white/[0.04]">
              <div><h3 className="text-lg font-black">{group.title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{group.summary}</p></div>
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">{group.items.length}項目</span>
            </summary>
            <div className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-2">{group.items.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h4 className="font-black">{entry.label}</h4><p className="mt-1 text-xl font-black text-white">{entry.currentValue}</p></div>
                  <div className="flex flex-wrap justify-end gap-1.5"><span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${originStyles[entry.origin]}`}>{entry.origin}</span><span className={`rounded-full bg-white/[0.07] px-2 py-1 text-[11px] font-bold ${controlStyles[entry.control]}`}>{entry.control}</span></div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{entry.note}</p>
                {entry.editor && <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-cyan-100">管理画面で変更可能</p><span className="rounded-full bg-black/25 px-2 py-1 text-[11px] font-bold text-slate-300">{entry.editor.applyMode === "next-game" ? "次のゲームから" : "最大5秒で反映"}</span></div>
                  <label className="mt-3 block text-xs font-bold text-slate-300">設定値（{entry.editor.minimum}〜{entry.editor.maximum}{entry.editor.unit}）
                    <div className="mt-1 flex items-center gap-2"><input type="number" min={entry.editor.minimum} max={entry.editor.maximum} step={entry.editor.step} value={drafts[entry.id] ?? String(entry.editor.value)} onChange={(event) => setDrafts((current) => ({ ...current, [entry.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-base font-black text-white outline-none focus:border-cyan-300" /><span className="shrink-0 text-xs text-slate-400">{entry.editor.unit}</span></div>
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={Boolean(savingId) || !drafts[entry.id] || Number(drafts[entry.id]) < entry.editor.minimum || Number(drafts[entry.id]) > entry.editor.maximum} onClick={() => void saveEntry(entry.id, Number(drafts[entry.id]))} className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-40">{savingId === entry.id ? "保存中…" : "この値を保存"}</button><button type="button" disabled={Boolean(savingId) || entry.editor.overrideValue === null} onClick={() => void saveEntry(entry.id, null)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40">既定へ戻す</button></div>
                  <p className="mt-2 text-[11px] text-slate-400">既定値：{entry.editor.defaultValue}{entry.editor.unit}{entry.editor.overrideValue !== null ? "／現在は運営上書き中" : ""}</p>
                </div>}
                {entry.recommendedValue && <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.07] px-3 py-2 text-xs leading-5 text-amber-100"><span className="font-black">検討値：</span>{entry.recommendedValue}</p>}
                <p className="mt-3 break-all font-mono text-[11px] leading-5 text-slate-500">{entry.source}</p>
              </article>
            ))}</div>
          </details>
        ))}{catalog && filteredGroups.length === 0 && <p className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-12 text-center text-sm text-slate-400">一致する項目はありません。</p>}</div>}
    </div>
  );
}

function SummaryCard({ label, value, note }: { label: string; value: number; note: string }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></article>;
}
