import type { Metadata } from "next";
import { appLocales, type AppLocale } from "./app-locale.ts";
import type { GameFieldsEnvironment } from "./game-fields-environment.ts";
import { isGameMarketingPageVisible } from "./game-marketing-publication.ts";
import type { BuiltInGameRoute } from "./game-routes.ts";

export function gameMarketingMetadata({
  route,
  locale,
  title,
  description,
  environment,
}: {
  route: BuiltInGameRoute;
  locale: AppLocale;
  title: string;
  description: string;
  environment?: GameFieldsEnvironment;
}): Metadata | null {
  if (!isGameMarketingPageVisible(route.registration, environment)) return null;

  const canonical = `/${locale}${route.landingPath}`;
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        appLocales.map(({ id }) => [id, `/${id}${route.landingPath}`]),
      ),
    },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      images: [{ url: `/game-visuals/${route.id}.webp`, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/game-visuals/${route.id}.webp`],
    },
    robots: route.registration.private
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}
