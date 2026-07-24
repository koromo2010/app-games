export const GAME_SDK_CONTENT_POOLS = [
  "general-words",
  "word-pairs",
  "rare-words",
] as const;

export const GAME_SDK_CONTENT_DIFFICULTIES = [
  "easy",
  "normal",
  "hard",
] as const;

export type GameSdkContentPool = (typeof GAME_SDK_CONTENT_POOLS)[number];
export type GameSdkContentDifficulty =
  (typeof GAME_SDK_CONTENT_DIFFICULTIES)[number];

export type GameSdkWordContent = {
  /** Opaque Platform identifier. Do not parse or persist it as a database key. */
  id: string;
  surface: string;
  reading?: string | null;
  difficulty: GameSdkContentDifficulty;
  tags?: readonly string[];
};

export type GameSdkWordPairContent = {
  /** Opaque Platform identifier. */
  id: string;
  first: GameSdkWordContent;
  second: GameSdkWordContent;
  difficulty: GameSdkContentDifficulty;
  relation?: string | null;
};

export type GameSdkWordDefinitionContent = {
  wordId: string;
  surface: string;
  definition: string;
};

export type GameSdkDrawWordsRequest = {
  pool: "general-words" | "rare-words";
  count: number;
  difficulty?: GameSdkContentDifficulty;
  excludeIds?: readonly string[];
  excludeSurfaces?: readonly string[];
};

export type GameSdkDrawWordPairsRequest = {
  pool: "word-pairs";
  count: number;
  difficulty?: GameSdkContentDifficulty;
  excludeIds?: readonly string[];
};

export type GameSdkFindDefinitionsRequest = {
  wordIds: readonly string[];
};

/**
 * Platform-injected content contract.
 *
 * A game package receives this interface from Game Fields. It never imports a
 * database client, connection string, or table name.
 */
export type GameSdkContentSource = {
  drawWords(
    request: GameSdkDrawWordsRequest,
  ): Promise<readonly GameSdkWordContent[]>;
  drawWordPairs(
    request: GameSdkDrawWordPairsRequest,
  ): Promise<readonly GameSdkWordPairContent[]>;
  findDefinitions(
    request: GameSdkFindDefinitionsRequest,
  ): Promise<readonly GameSdkWordDefinitionContent[]>;
};

function safeCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error("GAME_SDK_CONTENT_INVALID_COUNT");
  }
  return value;
}

function safeIds(values: readonly string[] | undefined, maximum = 1_000) {
  const normalized = [...new Set((values ?? []).map((value) => value.trim()))]
    .filter(Boolean);
  if (normalized.length > maximum) {
    throw new Error("GAME_SDK_CONTENT_TOO_MANY_EXCLUSIONS");
  }
  return normalized;
}

export function normalizeGameSdkDrawWordsRequest(
  request: GameSdkDrawWordsRequest,
): GameSdkDrawWordsRequest {
  if (request.pool !== "general-words" && request.pool !== "rare-words") {
    throw new Error("GAME_SDK_CONTENT_WORD_POOL_REQUIRED");
  }
  return {
    pool: request.pool,
    count: safeCount(request.count),
    difficulty: GAME_SDK_CONTENT_DIFFICULTIES.includes(
      request.difficulty ?? "normal",
    )
      ? request.difficulty ?? "normal"
      : "normal",
    excludeIds: safeIds(request.excludeIds),
    excludeSurfaces: safeIds(request.excludeSurfaces),
  };
}

export function normalizeGameSdkDrawWordPairsRequest(
  request: GameSdkDrawWordPairsRequest,
): GameSdkDrawWordPairsRequest {
  if (request.pool !== "word-pairs") {
    throw new Error("GAME_SDK_CONTENT_PAIR_POOL_REQUIRED");
  }
  return {
    pool: "word-pairs",
    count: safeCount(request.count),
    difficulty: GAME_SDK_CONTENT_DIFFICULTIES.includes(
      request.difficulty ?? "normal",
    )
      ? request.difficulty ?? "normal"
      : "normal",
    excludeIds: safeIds(request.excludeIds),
  };
}

export function normalizeGameSdkFindDefinitionsRequest(
  request: GameSdkFindDefinitionsRequest,
): GameSdkFindDefinitionsRequest {
  const wordIds = safeIds(request.wordIds, 100);
  if (wordIds.length === 0) {
    throw new Error("GAME_SDK_CONTENT_WORD_IDS_REQUIRED");
  }
  return { wordIds };
}

/** Adds request validation around a Platform or test content adapter. */
export function defineGameSdkContentSource(
  source: GameSdkContentSource,
): GameSdkContentSource {
  return {
    async drawWords(request) {
      return source.drawWords(normalizeGameSdkDrawWordsRequest(request));
    },
    async drawWordPairs(request) {
      return source.drawWordPairs(
        normalizeGameSdkDrawWordPairsRequest(request),
      );
    },
    async findDefinitions(request) {
      return source.findDefinitions(
        normalizeGameSdkFindDefinitionsRequest(request),
      );
    },
  };
}
