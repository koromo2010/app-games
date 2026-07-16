import type { MetadataRoute } from "next";
import { loadSiteSettings } from "@/lib/site-settings-store";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await loadSiteSettings();
  return {
    name: settings.siteName,
    short_name: settings.siteName,
    description: settings.searchDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [{ src: "/site-icon", sizes: "192x192" }],
  };
}
