import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { gamePageAccessAllowed } from "@/lib/game-access";
import { isGameMarketingPageVisible } from "@/lib/game-marketing-publication";
import { gameRouteForId } from "@/lib/game-routes";
import BuiltInGameLandingRoute, { generateMetadata as generateBuiltInGameMetadata } from "../[game]/page";

const params = Promise.resolve({ game: "code-intercept" });

export function generateMetadata(): Promise<Metadata> {
  return generateBuiltInGameMetadata({ params });
}

export default async function CodeInterceptLandingPage() {
  const route = gameRouteForId("code-intercept");
  if (!route || !isGameMarketingPageVisible(route.registration)) notFound();
  if (!(await gamePageAccessAllowed("code-intercept"))) redirect("/games");
  return BuiltInGameLandingRoute({ params });
}
