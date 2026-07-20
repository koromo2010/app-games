import type { MetadataRoute } from "next";
const paths = ["", "/games", "/wordwolf", "/tahoiya", "/word-scale", "/word-sonar", "/word-out", "/daifugo", "/terms", "/privacy", "/contact"];
export default function sitemap(): MetadataRoute.Sitemap { const now = new Date(); return paths.map((path) => ({ url: `https://www.game-fields.com${path || "/"}`, lastModified: now, changeFrequency: path === "" || path === "/games" ? "daily" : "weekly", priority: path === "" ? 1 : path === "/games" ? 0.9 : 0.7 })); }
