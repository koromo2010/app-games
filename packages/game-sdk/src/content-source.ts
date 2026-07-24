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

export type GameSdkContentPoolDefinition = {
  /** Stable API value. Store and send this value instead of the display name. */
  id: GameSdkContentPool;
  /** Canonical Japanese name for creator and player-facing UI. */
  displayName: string;
  /** Public selection boundary and intended use. */
  description: string;
  /** Whether a requested difficulty is mixed or matched exactly. */
  difficultySelection: "weighted-mix" | "exact-tier";
};

/**
 * Canonical public names and meanings of the Platform content pools.
 *
 * `rare-words` shares its source vocabulary with Tahoiya candidate discovery,
 * but does not mean that a word has been screened or accepted for Tahoiya.
 */
export const GAME_SDK_CONTENT_POOL_DEFINITIONS = {
  "general-words": {
    id: "general-words",
    displayName: "一般語彙",
    description:
      "単語ゲーム向けに利用可否と難易度を審査した、一般的な単語のプールです。",
    difficultySelection: "weighted-mix",
  },
  "word-pairs": {
    id: "word-pairs",
    displayName: "審査済みワードペア",
    description:
      "2語の関係と距離を審査したワードウルフ向けペアのプールです。",
    difficultySelection: "exact-tier",
  },
  "rare-words": {
    id: "rare-words",
    displayName: "低認知語彙",
    description:
      "共通語彙DBの実効Zipf値が0以上3未満の有効語です。読みが難しい語だけでなく、読みは平易でも意味を知る人が少ない語や意味が難しい語を含みます。たほい屋候補と母集団は重なりますが、たほい屋専用または審査・採用済みのお題という意味ではありません。",
    difficultySelection: "exact-tier",
  },
} as const satisfies Record<GameSdkContentPool, GameSdkContentPoolDefinition>;

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
  /** Reviewed general vocabulary or active low-recognition vocabulary. */
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
