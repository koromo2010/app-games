import type { GameCatalogEntry, GameTag } from "./game-catalog";
import { catalogEntryFromDefinition, lockedPlatformModules, type GameDefinition, type GameModulePolicy } from "./game-definition-source";

export type SdkGameDescriptor = {
  id: string;
  title: string;
  description: string;
  players?: string;
  time?: string;
  tags?: string[];
  visual?: string;
  modules?: GameModulePolicy["capabilities"];
};

const allowedTags = new Set<GameTag>([
  "対戦", "協力", "チーム戦", "正体隠匿", "会話", "ブラフ", "作文", "戦略", "連想", "推理", "お絵描き",
]);

function sdkTags(tags: string[] | undefined): GameTag[] {
  const normalized = (tags ?? []).filter((tag): tag is GameTag => allowedTags.has(tag as GameTag));
  return normalized.length > 0 ? normalized : ["対戦"];
}

/** Converts untrusted SDK metadata into the fixed Game Fields catalog-card contract. */
export function sdkGamesForCatalog(creatorSlug: string, descriptors: readonly SdkGameDescriptor[]): GameCatalogEntry[] {
  const definitions: GameDefinition[] = descriptors.map((game) => ({
    id: `sdk-${creatorSlug}-${game.id}`,
    catalog: {
      title: game.title,
      visual: game.visual || "/game-visuals/sdk-game-placeholder.svg",
      tags: sdkTags(game.tags),
      players: game.players || "人数設定あり",
      time: game.time || "未計測",
      summary: game.description,
      accent: "from-cyan-300 via-emerald-200 to-amber-200",
      private: false,
      stats: "local-disabled",
    },
    runtime: { kind: "sdk-package", creatorSlug, gameId: game.id },
    modules: {
      platform: lockedPlatformModules,
      core: { rules: { mode: "required" }, gameSurface: { mode: "required" }, domain: { mode: "required" }, presentation: { mode: "required" } },
      capabilities: game.modules ?? {
        onlineRoom: { mode: "enabled" },
        timer: { mode: "disabled", reason: "SDK metadataで時間制限が選択されていないため" },
        debug: { mode: "enabled" },
        spectators: { mode: "disabled", reason: "SDK metadataで観戦が選択されていないため" },
        stats: { mode: "disabled", reason: "未審査ゲームは共通戦績へ書き込まないため" },
        rating: { mode: "disabled", reason: "未審査ゲームはレーティング対象外のため" },
        replay: { mode: "disabled", reason: "SDK metadataでリプレイが選択されていないため" },
        resultShare: { mode: "disabled", reason: "SDK metadataで結果共有が選択されていないため" },
        llm: { mode: "disabled", reason: "SDK metadataでLLM利用が選択されていないため" },
      },
    },
  }));
  return definitions.map(catalogEntryFromDefinition);
}
