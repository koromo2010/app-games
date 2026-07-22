import registry from "../../config/game-registry.json" with { type: "json" };
import { builtInCapabilityPolicy } from "./built-in-game-module-policies";

export type GameDefinitionTag = "対戦" | "協力" | "チーム戦" | "正体隠匿" | "会話" | "ブラフ" | "作文" | "戦略" | "連想" | "推理" | "お絵描き";

export type GameCatalogDefinition = {
  title: string;
  englishTitle?: string;
  visual: string;
  tags: GameDefinitionTag[];
  players: string;
  time: string;
  summary: string;
  accent: string;
  private: boolean;
  stats: "account" | "local-disabled";
};

export type BuiltInGameRuntimeBinding = {
  kind: "built-in";
  href: string;
  entryFile: string;
  pageFile: string;
  roomStoreFile?: string;
};

export type SdkGameRuntimeBinding = {
  kind: "sdk-package";
  creatorSlug: string;
  gameId: string;
  revision?: string;
};

export type GameModuleDecision =
  | { mode: "required" }
  | { mode: "enabled" }
  | { mode: "disabled"; reason: string };

export type GameModulePolicy = {
  /** Platform-owned and impossible for a game package to disable or replace. */
  platform: {
    authentication: "platform-locked";
    accountSession: "platform-locked";
    commonNavigation: "platform-locked";
    playerMenu: "platform-locked";
    persistenceAdapter: "platform-locked";
    authorization: "platform-locked";
    observability: "platform-locked";
  };
  /** Every playable game package must implement these contracts. */
  core: {
    rules: { mode: "required" };
    gameSurface: { mode: "required" };
    domain: { mode: "required" };
    presentation: { mode: "required" };
  };
  /** Explicit decisions distinguish an intentional omission from missing work. */
  capabilities: {
    onlineRoom: GameModuleDecision;
    timer: GameModuleDecision;
    debug: GameModuleDecision;
    spectators: GameModuleDecision;
    stats: GameModuleDecision;
    rating: GameModuleDecision;
    replay: GameModuleDecision;
    resultShare: GameModuleDecision;
    llm: GameModuleDecision;
  };
};

export const lockedPlatformModules: GameModulePolicy["platform"] = {
  authentication: "platform-locked",
  accountSession: "platform-locked",
  commonNavigation: "platform-locked",
  playerMenu: "platform-locked",
  persistenceAdapter: "platform-locked",
  authorization: "platform-locked",
  observability: "platform-locked",
};

const requiredCoreModules: GameModulePolicy["core"] = {
  rules: { mode: "required" },
  gameSurface: { mode: "required" },
  domain: { mode: "required" },
  presentation: { mode: "required" },
};

/**
 * One complete game registration. Catalog metadata is deliberately only one
 * part: the runtime binding owns the game-specific entry/controller/server
 * implementation while Game Fields owns authentication and common chrome.
 */
export type GameDefinition = {
  id: string;
  catalog: GameCatalogDefinition;
  runtime: BuiltInGameRuntimeBinding | SdkGameRuntimeBinding;
  modules: GameModulePolicy;
};

export function builtInGameDefinitions(): GameDefinition[] {
  return registry.map((game) => {
    return ({
    id: game.id,
    catalog: {
      title: game.title,
      englishTitle: "englishTitle" in game ? game.englishTitle : undefined,
      visual: `/game-visuals/${game.id}.webp`,
      tags: game.tags as GameDefinitionTag[],
      players: game.players,
      time: game.time,
      summary: game.summary,
      accent: game.accent,
      private: game.private,
      stats: game.stats as GameCatalogDefinition["stats"],
    },
    runtime: {
      kind: "built-in" as const,
      href: game.href,
      entryFile: game.entryFile,
      pageFile: game.pageFile,
      ...("roomStoreFile" in game ? { roomStoreFile: game.roomStoreFile } : {}),
    },
    modules: {
      platform: lockedPlatformModules,
      core: requiredCoreModules,
      capabilities: builtInCapabilityPolicy(game.id),
    },
  });
  });
}

export function catalogEntryFromDefinition(definition: GameDefinition) {
  return {
    id: definition.id,
    ...definition.catalog,
    href: definition.runtime.kind === "built-in"
      ? definition.runtime.href
      : `/sdk-preview/${definition.runtime.creatorSlug}/games/${definition.runtime.gameId}`,
  };
}
