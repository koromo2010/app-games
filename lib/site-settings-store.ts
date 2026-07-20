import { getRedisConfig, redisCommand } from "@/lib/redis-store";
import { defaultSiteSettings, normalizeSiteSettings, type SiteSettings } from "@/lib/site-settings";

const siteSettingsKey = "site-settings:v1";
const cacheDurationMs = 30_000;
let cache: { settings: SiteSettings; expiresAt: number } | null = null;
let pendingLoad: Promise<SiteSettings> | null = null;

async function readSiteSettings() {
  if (!getRedisConfig()) return defaultSiteSettings;
  try {
    const stored = await redisCommand<string | null>(["GET", siteSettingsKey]);
    return stored ? normalizeSiteSettings(JSON.parse(stored)) : defaultSiteSettings;
  } catch {
    return defaultSiteSettings;
  }
}

export async function loadSiteSettings(options: { fresh?: boolean } = {}) {
  if (!options.fresh && cache && cache.expiresAt > Date.now()) return cache.settings;
  if (!options.fresh && pendingLoad) return pendingLoad;

  const request = readSiteSettings().then((settings) => {
    cache = { settings, expiresAt: Date.now() + cacheDurationMs };
    return settings;
  });
  if (!options.fresh) pendingLoad = request;
  try {
    return await request;
  } finally {
    if (pendingLoad === request) pendingLoad = null;
  }
}

export async function saveSiteSettings(settings: SiteSettings) {
  if (!getRedisConfig()) throw new Error("SITE_SETTINGS_STORE_NOT_CONFIGURED");
  const saved = normalizeSiteSettings({ ...settings, updatedAt: Date.now() });
  await redisCommand<"OK">(["SET", siteSettingsKey, JSON.stringify(saved)]);
  cache = { settings: saved, expiresAt: Date.now() + cacheDurationMs };
  return saved;
}
