import type { MetadataRoute } from "next";
import { appLocales } from "@/lib/app-locale";

const paths = ["", "/games", "/wordwolf", "/tahoiya", "/word-scale", "/word-sonar", "/word-out", "/daifugo", "/terms", "/privacy", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
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
