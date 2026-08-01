import type { AppLocale } from "./app-locale.ts";

export type GameDisplayCatalogSource = {
  id: string;
  title: string;
  href: string;
};

export type GameDisplayMetadata = {
  stableId: string;
  source: "built-in" | "sdk";
  title: Record<AppLocale, string>;
  href: string;
};

export type GameDisplayMetadataSnapshot = Record<string, GameDisplayMetadata>;

type DisplayCatalogInput = {
  builtIn: {
    ja: readonly GameDisplayCatalogSource[];
    en: readonly GameDisplayCatalogSource[];
  };
  sdk: {
    ja: readonly GameDisplayCatalogSource[];
    en: readonly GameDisplayCatalogSource[];
  };
};

const fallback = {
  "built-in": {
    ja: "ゲーム",
    en: "Game",
  },
  sdk: {
    ja: "SDKゲーム",
    en: "SDK game",
  },
} as const;

function cleanTitle(value: unknown, fallbackTitle: string) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallbackTitle;
}

function localizedTitle(
  id: string,
  source: "built-in" | "sdk",
  jaEntries: readonly GameDisplayCatalogSource[],
  enEntries: readonly GameDisplayCatalogSource[],
) {
  const ja = jaEntries.find((entry) => entry.id === id)?.title;
  const en = enEntries.find((entry) => entry.id === id)?.title;
  const safeJa = cleanTitle(ja, fallback[source].ja);
  return {
    ja: safeJa,
    en: cleanTitle(en, safeJa),
  };
}

function addSources(
  snapshot: GameDisplayMetadataSnapshot,
  source: "built-in" | "sdk",
  jaEntries: readonly GameDisplayCatalogSource[],
  enEntries: readonly GameDisplayCatalogSource[],
) {
  for (const entry of jaEntries) {
    const id = entry.id.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) continue;
    const stableId = source === "sdk" ? `sdk:${id}` : id;
    const expectedHref = source === "sdk" ? `/sdk-games/${id}` : entry.href;
    snapshot[stableId] = {
      stableId,
      source,
      title: localizedTitle(id, source, jaEntries, enEntries),
      href: expectedHref,
    };
  }
}

/**
 * Creates the serializable, request-scoped display read model used by every
 * user-facing game surface. Stable IDs stay as map keys and never become a
 * display fallback.
 */
export function createGameDisplayMetadataSnapshot(
  input: DisplayCatalogInput,
): GameDisplayMetadataSnapshot {
  const snapshot: GameDisplayMetadataSnapshot = {};
  addSources(snapshot, "built-in", input.builtIn.ja, input.builtIn.en);
  addSources(snapshot, "sdk", input.sdk.ja, input.sdk.en);
  return snapshot;
}

export function resolveGameDisplayMetadata(
  snapshot: GameDisplayMetadataSnapshot,
  stableId: string,
  locale: AppLocale,
) {
  const resolved = snapshot[stableId];
  if (resolved) {
    return {
      ...resolved,
      displayName: resolved.title[locale] || resolved.title.ja,
      available: true,
    };
  }
  const source = stableId.startsWith("sdk:") ? "sdk" as const : "built-in" as const;
  return {
    stableId,
    source,
    title: fallback[source],
    displayName: fallback[source][locale],
    href: "/games",
    available: false,
  };
}

export async function loadGameDisplayMetadataSnapshot(input: {
  builtIn: DisplayCatalogInput["builtIn"];
  loadSdkCatalog: () => Promise<{
    ja: readonly GameDisplayCatalogSource[];
    en: readonly GameDisplayCatalogSource[];
  }>;
}) {
  let sdk: DisplayCatalogInput["sdk"] = { ja: [], en: [] };
  try {
    sdk = await input.loadSdkCatalog();
  } catch {
    // A catalog outage must never expose a raw stable ID or stale private name.
  }
  return createGameDisplayMetadataSnapshot({ builtIn: input.builtIn, sdk });
}
