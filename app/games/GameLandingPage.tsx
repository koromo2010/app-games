import Image from "next/image";
import type { ReactNode } from "react";
import { AppLink } from "@/app/components/AppLink";
import { gamesForLocale } from "@/app/games/game-catalog";
import type { AppLocale } from "@/lib/app-locale";
import {
  publishedMarketingGameRoutes,
  type BuiltInGameRoute,
} from "@/lib/game-routes";

const copy = {
  ja: {
    eyebrow: "GAME FIELDSで遊べるゲーム",
    play: "無料で遊ぶ",
    catalog: "ゲーム一覧",
    players: "人数",
    time: "目安時間",
    devices: "対応端末",
    deviceValue: "スマートフォン・PC",
    overview: "ゲーム概要",
    howTo: "遊び方",
    features: "特徴",
    faq: "よくある質問",
    related: "関連ゲーム・記事",
    steps: ["ログインして部屋を作るか、参加する部屋を選びます。", "画面の案内に沿って設定を確認し、参加者がそろったら開始します。", "ゲームごとのルールに従って遊び、結果をみんなで確認します。"],
    faqItems: [
      ["無料で遊べますか？", "はい。Game Fieldsのアカウントでログインすると無料で遊べます。"],
      ["スマートフォンでも遊べますか？", "はい。スマートフォンとPCのブラウザに対応しています。"],
      ["離れた人とも遊べますか？", "はい。オンラインの部屋を作り、招待された参加者と遊べます。"],
    ],
    relatedEmpty: "関連コンテンツは準備中です。",
    bottomTitle: "さっそく遊んでみよう",
  },
  en: {
    eyebrow: "Play on GAME FIELDS",
    play: "Play for free",
    catalog: "All games",
    players: "Players",
    time: "Estimated time",
    devices: "Devices",
    deviceValue: "Phone and desktop",
    overview: "Overview",
    howTo: "How to play",
    features: "Features",
    faq: "Frequently asked questions",
    related: "Related games and articles",
    steps: ["Sign in, then create a room or choose one to join.", "Review the settings and start when everyone is ready.", "Follow the game rules and review the result together."],
    faqItems: [
      ["Is it free to play?", "Yes. Sign in with a Game Fields account and play for free."],
      ["Can I play on a phone?", "Yes. Game Fields supports phone and desktop browsers."],
      ["Can I play remotely?", "Yes. Create an online room and invite the other players."],
    ],
    relatedEmpty: "More related content is coming soon.",
    bottomTitle: "Ready to play?",
  },
} as const;

function jsonLd(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function GameLandingPage({
  route,
  locale,
  children,
}: {
  route: BuiltInGameRoute;
  locale: AppLocale;
  children?: ReactNode;
}) {
  const text = copy[locale];
  const localizedGames = gamesForLocale(locale);
  const localizedGamesById = new Map(localizedGames.map((candidate) => [candidate.id, candidate]));
  const game = localizedGamesById.get(route.id);
  if (!game) return null;
  const related = publishedMarketingGameRoutes()
    .filter((candidateRoute) => candidateRoute.id !== route.id)
    .flatMap((candidateRoute) => {
      const candidate = localizedGamesById.get(candidateRoute.id);
      return candidate ? [{ candidate, candidateRoute }] : [];
    })
    .slice(0, 3);
  const canonical = `https://www.game-fields.com/${locale}${route.landingPath}`;
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Game Fields", item: `https://www.game-fields.com/${locale}` },
      { "@type": "ListItem", position: 2, name: text.catalog, item: `https://www.game-fields.com/${locale}/games` },
      { "@type": "ListItem", position: 3, name: game.title, item: canonical },
    ],
  };
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: text.faqItems.map(([name, answer]) => ({
      "@type": "Question",
      name,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />
      <section className="relative isolate overflow-hidden border-b border-slate-800 bg-slate-950 text-white">
        <Image src={game.visual} alt="" fill priority sizes="100vw" unoptimized className="-z-20 object-cover opacity-90 brightness-110 saturate-[1.08]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/90 via-slate-900/55 to-slate-950/5" />
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">{text.eyebrow}</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">{game.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-200 sm:text-lg">{game.summary}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <AppLink href={route.playPath} className="rounded-lg bg-cyan-300 px-6 py-3 font-black text-slate-950 shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">{text.play}</AppLink>
            <AppLink href="/games" className="rounded-lg border border-white/30 bg-slate-950/60 px-6 py-3 font-black text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">{text.catalog}</AppLink>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-5 py-12 sm:py-16">
        <section className="grid gap-3 sm:grid-cols-3">
          {[[text.players, game.players], [text.time, game.time], [text.devices, text.deviceValue]].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-cyan-800">{label}</p><p className="mt-2 text-lg font-black text-slate-950">{value}</p></div>
          ))}
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div><h2 className="text-2xl font-black text-slate-950">{text.overview}</h2><p className="mt-4 leading-8 text-slate-700">{game.summary}</p></div>
          <div><h2 className="text-2xl font-black text-slate-950">{text.features}</h2><ul className="mt-4 flex flex-wrap gap-2">{game.tags.map((tag) => <li key={tag} className="rounded-full border border-cyan-700/30 bg-cyan-100 px-4 py-2 text-sm font-bold text-cyan-950">{tag}</li>)}</ul></div>
        </section>

        <section><h2 className="text-2xl font-black text-slate-950">{text.howTo}</h2><ol className="mt-5 grid gap-4 md:grid-cols-3">{text.steps.map((step, index) => <li key={step} className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm"><span className="text-3xl font-black text-cyan-800">{index + 1}</span><p className="mt-3 leading-7 text-slate-700">{step}</p></li>)}</ol></section>

        {children && <section data-game-landing-extension>{children}</section>}

        <section><h2 className="text-2xl font-black text-slate-950">{text.faq}</h2><div className="mt-5 space-y-3">{text.faqItems.map(([question, answer]) => <details key={question} className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm"><summary className="cursor-pointer rounded-sm font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2">{question}</summary><p className="mt-3 leading-7 text-slate-700">{answer}</p></details>)}</div></section>

        <section><h2 className="text-2xl font-black text-slate-950">{text.related}</h2>{related.length ? <div className="mt-5 grid gap-4 md:grid-cols-3">{related.map(({ candidate, candidateRoute }) => (
          <AppLink key={candidate.id} href={candidateRoute.landingPath} className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm transition hover:border-cyan-700 hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2"><h3 className="font-black text-slate-950">{candidate.title}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-700">{candidate.summary}</p></AppLink>
        ))}</div> : <p className="mt-4 text-slate-700">{text.relatedEmpty}</p>}</section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-7 text-center text-white shadow-sm sm:p-10"><h2 className="text-2xl font-black">{text.bottomTitle}</h2><p className="mt-2 font-bold text-slate-300">{game.title}</p><AppLink href={route.playPath} className="mt-6 inline-flex rounded-lg bg-cyan-300 px-7 py-3 font-black text-slate-950 shadow-lg transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">{text.play}</AppLink></section>
      </div>
    </main>
  );
}
