export type SiteSettings = {
  siteName: string;
  searchTitle: string;
  searchDescription: string;
  iconUrl: string | null;
  updatedAt: number | null;
};

export const defaultSiteSettings: SiteSettings = {
  siteName: "GAME FIELDS",
  searchTitle: "GAME FIELDS | 友達と遊べるオンラインパーティーゲーム",
  searchDescription: "ワードゲームや協力ゲームを、ブラウザから友達と遊べるオンラインゲーム広場。部屋を作って離れた相手ともすぐに遊べます。",
  iconUrl: null,
  updatedAt: null,
};

export const siteSettingsLimits = { siteName: 40, searchTitle: 70, searchDescription: 200 } as const;

function normalizedText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized && normalized.length <= maxLength ? normalized : fallback;
}

export function isSiteIconUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1_000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com") && url.pathname.startsWith("/site-icons/") && /\.(png|webp)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeSiteSettings(value: unknown): SiteSettings {
  const input = value && typeof value === "object" ? value as Partial<SiteSettings> : {};
  return {
    siteName: normalizedText(input.siteName, defaultSiteSettings.siteName, siteSettingsLimits.siteName),
    searchTitle: normalizedText(input.searchTitle, defaultSiteSettings.searchTitle, siteSettingsLimits.searchTitle),
    searchDescription: normalizedText(input.searchDescription, defaultSiteSettings.searchDescription, siteSettingsLimits.searchDescription),
    iconUrl: input.iconUrl === null || input.iconUrl === "" ? null : isSiteIconUrl(input.iconUrl) ? input.iconUrl : defaultSiteSettings.iconUrl,
    updatedAt: typeof input.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : null,
  };
}

export function validateSiteSettingsInput(value: unknown) {
  if (!value || typeof value !== "object") return "INVALID_SETTINGS";
  const input = value as Partial<SiteSettings>;
  const fields = [[input.siteName, siteSettingsLimits.siteName], [input.searchTitle, siteSettingsLimits.searchTitle], [input.searchDescription, siteSettingsLimits.searchDescription]] as const;
  if (fields.some(([field, max]) => typeof field !== "string" || !field.trim() || field.replace(/\s+/g, " ").trim().length > max)) return "INVALID_TEXT";
  if (input.iconUrl !== null && !isSiteIconUrl(input.iconUrl)) return "INVALID_ICON_URL";
  return null;
}
