import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PlayerAuthGate } from "@/app/components/PlayerAuthGate";
import { CanvasGame } from "@/app/canvas/CanvasGame";
import { CodeInterceptGame } from "@/app/code-intercept/CodeInterceptGame";
import { DaifugoGame } from "@/app/daifugo/DaifugoGame";
import { HodoaiTalkGame } from "@/app/hodoai-talk/HodoaiTalkGame";
import { KotobaSenpukuGame } from "@/app/kotoba-senpuku/KotobaSenpukuGame";
import { NigoichiGame } from "@/app/nigoichi/NigoichiGame";
import { NorthernBranchGame } from "@/app/northern-branch/NorthernBranchGame";
import { TahoiyaGame } from "@/app/tahoiya/TahoiyaGame";
import { WordWolfGame } from "@/app/wordwolf/WordWolfGame";
import { gamesForLocale } from "@/app/games/game-catalog";
import { appLocales, normalizeAppLocale } from "@/lib/app-locale";
import { gamePageAccessAllowed } from "@/lib/game-access";
import { builtInGameRoutes, gameRouteForSlug } from "@/lib/game-routes";
import { getAuthenticatedPlayer } from "@/lib/player-auth";

type Props = { params: Promise<{ game: string }> };

const gameComponents = {
  wordwolf: WordWolfGame,
  tahoiya: TahoiyaGame,
  "northern-branch": NorthernBranchGame,
  hodoai: HodoaiTalkGame,
  "kotoba-senpuku": KotobaSenpukuGame,
  nigoichi: NigoichiGame,
  "code-intercept": CodeInterceptGame,
  canvas: CanvasGame,
  daifugo: DaifugoGame,
} as const;

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return builtInGameRoutes.map((route) => ({ game: route.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params;
  const route = gameRouteForSlug(slug);
  if (!route) return {};
  const locale = normalizeAppLocale((await headers()).get("x-app-locale"));
  const localizedGame = gamesForLocale(locale).find((candidate) => candidate.id === route.id);
  const title = localizedGame?.title ?? route.registration.title;
  return {
    title,
    description: localizedGame?.summary ?? route.registration.summary,
    alternates: {
      canonical: `/${locale}${route.playPath}`,
      languages: Object.fromEntries(appLocales.map(({ id }) => [id, `/${id}${route.playPath}`])),
    },
    robots: { index: false, follow: true },
  };
}

export default async function BuiltInGamePlayRoute({ params }: Props) {
  const { game: slug } = await params;
  const route = gameRouteForSlug(slug);
  if (!route) notFound();
  const player = await getAuthenticatedPlayer();
  if (!player) return <PlayerAuthGate title={route.registration.title} />;
  if (!(await gamePageAccessAllowed(route.id))) redirect("/games");
  const Game = gameComponents[route.id as keyof typeof gameComponents];
  if (!Game) notFound();
  return <Game />;
}
