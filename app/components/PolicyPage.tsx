import Link from "next/link";
import type { ReactNode } from "react";

export function PolicyPage({ eyebrow, title, updatedAt, children }: { eyebrow: string; title: string; updatedAt: string; children: ReactNode }) {
  return <main className="flex-1 bg-slate-100 px-4 py-10 text-slate-800">
    <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10">
      <Link href="/games" className="text-sm font-bold text-cyan-700 hover:underline">← 広場へ戻る</Link>
      <header className="mt-7 border-b border-slate-200 pb-6"><p className="text-xs font-black tracking-[0.18em] text-cyan-700">{eyebrow}</p><h1 className="mt-2 text-3xl font-black text-slate-950">{title}</h1><p className="mt-2 text-xs text-slate-500">制定・最終更新：{updatedAt}</p></header>
      <div className="policy-content mt-7 space-y-7 text-sm leading-7">{children}</div>
    </article>
  </main>;
}
