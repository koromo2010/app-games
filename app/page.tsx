import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Game Lobby | App Games",
  description: "Prototype game lobby for party games.",
};

const games = [
  {
    title: "ワードウルフ",
    status: "Playable",
    href: "/wordwolf",
    players: "3-6人",
    time: "5-15分",
    summary: "似ているけど違うお題を持つ狼を、会話と投票で探すゲーム。",
    accent: "from-cyan-300 to-amber-200",
  },
  {
    title: "準備中",
    status: "Next",
    href: null,
    players: "-",
    time: "-",
    summary: "次に追加するゲームをここへ並べられる枠です。",
    accent: "from-slate-300 to-slate-100",
  },
  {
    title: "準備中",
    status: "Idea",
    href: null,
    players: "-",
    time: "-",
    summary: "ルール検証中のゲームやプロトタイプをカード化できます。",
    accent: "from-violet-300 to-rose-200",
  },
];

export default function GameLobbyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.22),transparent_34%),linear-gradient(135deg,#020617_0%,#111827_55%,#3f2b12_100%)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <p className="text-xs font-semibold uppercase text-cyan-200">Prototype game shelf</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-normal sm:text-4xl">ゲームロビー</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
                作ったゲームをここに並べて、遊ぶゲームを選んで入る場所です。
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex w-fit rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-white/15"
            >
              トップへ
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-4 md:grid-cols-3">
          {games.map((game) => {
            const card = (
              <article className="h-full rounded-lg border border-white/10 bg-white/[0.96] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
                <div className={`h-24 rounded-lg bg-gradient-to-br ${game.accent}`} />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black text-slate-950">{game.title}</h2>
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {game.status}
                  </span>
                </div>
                <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">{game.summary}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-100 px-3 py-2">
                    <p className="text-xs text-slate-500">人数</p>
                    <p className="font-bold text-slate-950">{game.players}</p>
                  </div>
                  <div className="rounded-lg bg-slate-100 px-3 py-2">
                    <p className="text-xs text-slate-500">目安</p>
                    <p className="font-bold text-slate-950">{game.time}</p>
                  </div>
                </div>
                <div className="mt-4">
                  {game.href ? (
                    <span className="inline-flex rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm">
                      遊ぶ
                    </span>
                  ) : (
                    <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400">
                      準備中
                    </span>
                  )}
                </div>
              </article>
            );

            return game.href ? (
              <Link key={game.title} href={game.href} className="block">
                {card}
              </Link>
            ) : (
              <div key={`${game.title}-${game.status}`} className="block opacity-80">
                {card}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

