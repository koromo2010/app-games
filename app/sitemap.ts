import type { MetadataRoute } from "next";
import { appLocales } from "@/lib/app-locale";
import { publicGameRoutes } from "@/lib/game-routes";

const staticPaths = ["", "/games", "/terms", "/privacy", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = [...staticPaths, ...publicGameRoutes().map((route) => route.landingPath)];
  return appLocales.flatMap(({ id: locale }) => paths.map((path) => ({
    url: `https://www.game-fields.com/${locale}${path}`,
    lastModified: now,
    changeFrequency: path === "" || path === "/games" ? "daily" as const : "weekly" as const,
    priority: path === "" ? 1 : path === "/games" ? 0.9 : 0.7,
    alternates: {
      languages: Object.fromEntries(appLocales.map(({ id }) => [id, `https://www.game-fields.com/${id}${path}`])),
    },
  })));
}
