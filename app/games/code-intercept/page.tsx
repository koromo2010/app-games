import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { gamePageAccessAllowed } from "@/lib/game-access";
import BuiltInGameLandingRoute, { generateMetadata as generateBuiltInGameMetadata } from "../[game]/page";

const params = Promise.resolve({ game: "code-intercept" });

export function generateMetadata(): Promise<Metadata> {
  return generateBuiltInGameMetadata({ params });
}

export default async function CodeInterceptLandingPage() {
  if (!(await gamePageAccessAllowed("code-intercept"))) redirect("/games");
  return BuiltInGameLandingRoute({ params });
}
