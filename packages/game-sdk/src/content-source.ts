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
  /**
   * Opaque Platform identifier used by excludeIds and findDefinitions.
   * Do not parse it or treat it as a database key.
   */
  id: string;
  /** Display form shown to players. */
  surface: string;
  /** Optional reading. Japanese content uses hiragana where available. */
  reading?: string | null;
  /**
   * Actual tier of this item. A mixed draw can return a lower tier than the
   * requested difficulty.
   */
  difficulty: GameSdkContentDifficulty;
  /** Public content classifications such as the source pool ID. */
  tags?: readonly string[];
};

export type GameSdkWordPairContent = {
  /** Opaque pair identifier used by excludeIds. */
  id: string;
  /** First word in the pair. Its id can be passed to findDefinitions. */
  first: GameSdkWordContent;
  /** Second word in the pair. Its id can be passed to findDefinitions. */
  second: GameSdkWordContent;
  /** Pair difficulty derived from the reviewed relation/distance. */
  difficulty: GameSdkContentDifficulty;
  /** Optional short description of the reviewed relationship. */
  relation?: string | null;
};

export type GameSdkWordDefinitionContent = {
  /** Opaque word ID supplied to findDefinitions. */
  wordId: string;
  /** Display form corresponding to wordId. */
  surface: string;
  /** Short Game Fields-authored, game-oriented definition. */
  definition: string;
};

export type GameSdkDrawWordsRequest = {
  /** Curated standard vocabulary or reviewed rare vocabulary. */
  pool: "general-words" | "rare-words";
  /** Number of distinct items to draw. Integer from 1 through 100. */
  count: number;
  /** Client-selected difficulty. Defaults to normal. */
  difficulty?: GameSdkContentDifficulty;
  /** Opaque word IDs that must not be returned. */
  excludeIds?: readonly string[];
  /** Surface forms that must not be returned after normalization. */
  excludeSurfaces?: readonly string[];
};

export type GameSdkDrawWordPairsRequest = {
  pool: "word-pairs";
  /** Number of distinct reviewed pairs to draw. Integer from 1 through 100. */
  count: number;
  /** Client-selected reviewed pair difficulty. Defaults to normal. */
  difficulty?: GameSdkContentDifficulty;
  /** Opaque pair IDs that must not be returned. */
  excludeIds?: readonly string[];
};

export type GameSdkFindDefinitionsRequest = {
  /** Opaque word IDs previously returned by drawWords/drawWordPairs. */
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

function safeDifficulty(value: GameSdkContentDifficulty | undefined) {
  const difficulty = value ?? "normal";
  if (!GAME_SDK_CONTENT_DIFFICULTIES.includes(difficulty)) {
    throw new Error("GAME_SDK_CONTENT_INVALID_DIFFICULTY");
  }
  return difficulty;
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
    difficulty: safeDifficulty(request.difficulty),
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
    difficulty: safeDifficulty(request.difficulty),
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
