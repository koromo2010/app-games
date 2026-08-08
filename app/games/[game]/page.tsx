import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { GameLandingPage } from "@/app/games/GameLandingPage";
import { gamesForLocale } from "@/app/games/game-catalog";
import { normalizeAppLocale } from "@/lib/app-locale";
import { gameMarketingMetadata } from "@/lib/game-marketing-metadata";
import { isGameMarketingPageVisible } from "@/lib/game-marketing-publication";
import { gameRouteForSlug, visibleMarketingGameRoutes } from "@/lib/game-routes";

type Props = { params: Promise<{ game: string }> };

export function generateStaticParams() {
  return visibleMarketingGameRoutes().map((route) => ({ game: route.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params;
  const route = gameRouteForSlug(slug);
  if (!route) return {};
  const locale = normalizeAppLocale((await headers()).get("x-app-locale"));
  const localizedGame = gamesForLocale(locale).find((candidate) => candidate.id === route.id);
  const title = localizedGame?.title ?? route.registration.title;
  const description = localizedGame?.summary ?? route.registration.summary;
  const metadata = gameMarketingMetadata({
    route,
    locale,
    title,
    description,
  });
  if (!metadata) notFound();
  return metadata;
}

export default async function BuiltInGameLandingRoute({ params }: Props) {
  const { game: slug } = await params;
  const route = gameRouteForSlug(slug);
  if (!route || !isGameMarketingPageVisible(route.registration)) notFound();
  const locale = normalizeAppLocale((await headers()).get("x-app-locale"));
  return <GameLandingPage route={route} locale={locale} />;
}
