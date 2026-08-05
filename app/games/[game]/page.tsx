import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { GameLandingPage } from "@/app/games/GameLandingPage";
import { gamesForLocale } from "@/app/games/game-catalog";
import { appLocales, normalizeAppLocale } from "@/lib/app-locale";
import { builtInGameRoutes, gameRouteForSlug } from "@/lib/game-routes";

type Props = { params: Promise<{ game: string }> };

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
  const canonical = `/${locale}${route.landingPath}`;
  const description = localizedGame?.summary ?? route.registration.summary;
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: Object.fromEntries(appLocales.map(({ id }) => [id, `/${id}${route.landingPath}`])),
    },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      images: [{ url: `/game-visuals/${route.id}.webp`, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`/game-visuals/${route.id}.webp`] },
    robots: route.registration.private ? { index: false, follow: false } : { index: true, follow: true },
  };
}

export default async function BuiltInGameLandingRoute({ params }: Props) {
  const { game: slug } = await params;
  const route = gameRouteForSlug(slug);
  if (!route) notFound();
  const locale = normalizeAppLocale((await headers()).get("x-app-locale"));
  return <GameLandingPage route={route} locale={locale} />;
}
