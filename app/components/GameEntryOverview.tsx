"use client";

import { AppLink } from "@/app/components/AppLink";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { gameEntryOverviewFor } from "@/lib/game-entry-overview";

export function GameEntryOverview({ gameId }: { gameId: string }) {
  const { locale } = useAppLocale();
  const overview = gameEntryOverviewFor(gameId, locale);
  if (!overview) return null;

  return (
    <section aria-labelledby={`${gameId}-entry-overview-title`} className="rounded-2xl border border-white/10 bg-white/[0.96] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.16)] sm:p-6">
      <p className="text-xs font-black uppercase tracking-[.16em] text-amber-700">ゲームを始める前に</p>
      <h2 id={`${gameId}-entry-overview-title`} className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">{overview.title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">{overview.summary}</p>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-100 px-4 py-3">
          <dt className="text-xs font-bold text-slate-500">人数</dt>
          <dd className="mt-1 text-sm font-black text-slate-950">{overview.players}</dd>
        </div>
        <div className="rounded-xl bg-slate-100 px-4 py-3">
          <dt className="text-xs font-bold text-slate-500">目安時間</dt>
          <dd className="mt-1 text-sm font-black text-slate-950">{overview.time}</dd>
        </div>
        <div className="rounded-xl bg-slate-100 px-4 py-3">
          <dt className="text-xs font-bold text-slate-500">ジャンル</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">{overview.tags.map((tag) => <span key={tag} className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-700 shadow-sm">{tag}</span>)}</dd>
        </div>
      </dl>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-black text-slate-950">遊び方</h3>
        <ol className="mt-3 grid gap-3 text-sm leading-6 text-slate-700 sm:grid-cols-3">
          <li className="rounded-xl border border-slate-200 p-3"><span className="font-black text-amber-700">1.</span> 部屋を作るか、コードで参加します。</li>
          <li className="rounded-xl border border-slate-200 p-3"><span className="font-black text-amber-700">2.</span> 部屋コードを一緒に遊ぶ人へ共有します。</li>
          <li className="rounded-xl border border-slate-200 p-3"><span className="font-black text-amber-700">3.</span> 全員がそろったら、部屋から開始します。</li>
        </ol>
        {overview.helpHref ? <AppLink href={overview.helpHref} className="mt-5 inline-flex rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">遊び方はこちら</AppLink> : null}
      </div>
    </section>
  );
}
