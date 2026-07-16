import { getRedisConfig, redisCommand } from "@/lib/redis-store";
import { defaultSiteSettings, normalizeSiteSettings, type SiteSettings } from "@/lib/site-settings";

const siteSettingsKey = "site-settings:v1";

export async function loadSiteSettings() {
  if (!getRedisConfig()) return defaultSiteSettings;
  try {
    const stored = await redisCommand<string | null>(["GET", siteSettingsKey]);
    return stored ? normalizeSiteSettings(JSON.parse(stored)) : defaultSiteSettings;
  } catch {
    return defaultSiteSettings;
  }
}

export async function saveSiteSettings(settings: SiteSettings) {
  if (!getRedisConfig()) throw new Error("SITE_SETTINGS_STORE_NOT_CONFIGURED");
  const saved = normalizeSiteSettings({ ...settings, updatedAt: Date.now() });
  await redisCommand<"OK">(["SET", siteSettingsKey, JSON.stringify(saved)]);
  return saved;
}
