import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  defineGameSdkContentSource,
  type GameSdkContentDifficulty,
  type GameSdkContentSource,
  type GameSdkWordContent,
  type GameSdkWordDefinitionContent,
  type GameSdkWordPairContent,
} from "@game-fields/game-sdk/content-source";
import {
  generalGameWordDifficultyWeights,
  normalizeGeneralGameWord,
  type GeneralGameWordDifficulty,
} from "./general-game-word-pool.ts";
import { getPostgresClient } from "./postgres-store.ts";
import { expectedAppEnvironment } from "./storage-environment-guard.ts";
import { getVocabularyPostgresClient } from "./vocabulary-postgres-store.ts";

type ContentWordSource = "app" | "vocabulary";

export type GameFieldsSdkContentWordRecord = {
  source: ContentWordSource;
  internalId: string;
  surface: string;
  normalizedSurface: string;
  reading: string | null;
  difficulty: GameSdkContentDifficulty;
};

export type GameFieldsSdkContentPairRecord = {
  internalId: string;
  first: GameFieldsSdkContentWordRecord;
  second: GameFieldsSdkContentWordRecord;
  difficulty: GameSdkContentDifficulty;
  relation: string | null;
};

export type GameFieldsSdkContentDefinitionRecord = {
  word: GameFieldsSdkContentWordRecord;
  definition: string;
};

export type GameFieldsSdkContentRepository = {
  loadGeneralWords(): Promise<readonly GameFieldsSdkContentWordRecord[]>;
  loadRareWords(): Promise<readonly GameFieldsSdkContentWordRecord[]>;
  loadWordPairs(): Promise<readonly GameFieldsSdkContentPairRecord[]>;
  loadDefinitions(
    words: readonly GameFieldsSdkContentWordRecord[],
  ): Promise<readonly GameFieldsSdkContentDefinitionRecord[]>;
};

type GeneralWordRow = {
  id: string | number;
  surface: string;
  reading: string | null;
  difficulty: GameSdkContentDifficulty;
};

type VocabularyWordRow = {
  id: string;
  surface: string;
  normalized_surface: string;
  reading: string | null;
  zipf: number | string | null;
};

type VocabularyPairRow = {
  id: string;
  word_a_id: string;
  word_a_surface: string;
  word_a_normalized_surface: string;
  word_a_reading: string | null;
  word_a_zipf: number | string | null;
  word_b_id: string;
  word_b_surface: string;
  word_b_normalized_surface: string;
  word_b_reading: string | null;
  word_b_zipf: number | string | null;
  relation: string | null;
  pair_distance: string | null;
  difficulty: string | null;
};

type VocabularyDefinitionRow = {
  word_id: string;
  surface: string;
  normalized_surface: string;
  reading: string | null;
  zipf: number | string | null;
  short_definition: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rareDifficulty(zipfValue: number | string | null) {
  const zipf = Number(zipfValue);
  if (!Number.isFinite(zipf) || zipf < 1) return "hard" satisfies GameSdkContentDifficulty;
  if (zipf < 2) return "normal" satisfies GameSdkContentDifficulty;
  return "easy" satisfies GameSdkContentDifficulty;
}

function pairDifficulty(pairDistance: string | null, difficulty: string | null) {
  const value = pairDistance ?? difficulty;
  if (value === "near" || value === "easy") return "easy" satisfies GameSdkContentDifficulty;
  if (value === "wide" || value === "hard") return "hard" satisfies GameSdkContentDifficulty;
  return "normal" satisfies GameSdkContentDifficulty;
}

function vocabularyWord(
  row: Pick<VocabularyWordRow, "id" | "surface" | "normalized_surface" | "reading" | "zipf">,
): GameFieldsSdkContentWordRecord {
  return {
    source: "vocabulary",
    internalId: row.id,
    surface: row.surface,
    normalizedSurface: row.normalized_surface,
    reading: row.reading,
    difficulty: rareDifficulty(row.zipf),
  };
}

export function createPostgresGameFieldsSdkContentRepository(): GameFieldsSdkContentRepository {
  return {
    async loadGeneralWords() {
      const rows = await getPostgresClient()`
        SELECT catalog.word_master_id AS id, catalog.surface, catalog.reading,
               evaluation.difficulty_tier AS difficulty
        FROM shared_word_catalog catalog
        JOIN shared_word_pool_evaluations evaluation
          ON evaluation.word_master_id = catalog.word_master_id
        WHERE catalog.active
          AND evaluation.pool_key = 'standard-game'
          AND evaluation.active
          AND evaluation.eligibility_status = 'eligible'
          AND evaluation.difficulty_tier IN ('easy', 'normal', 'hard')
          AND 'general_game_pool' = ANY(evaluation.evaluation_flags)
          AND ('difficulty_' || evaluation.difficulty_tier) = ANY(evaluation.evaluation_flags)
        ORDER BY catalog.word_master_id
      ` as GeneralWordRow[];
      return rows.map((row) => ({
        source: "app" as const,
        internalId: String(row.id),
        surface: row.surface,
        normalizedSurface: normalizeGeneralGameWord(row.surface),
        reading: row.reading,
        difficulty: row.difficulty,
      }));
    },

    async loadRareWords() {
      const sql = getVocabularyPostgresClient();
      const rows = expectedAppEnvironment() === "production"
        ? await sql`
          SELECT id, surface, normalized_surface, reading, effective_zipf AS zipf
          FROM active_words
          WHERE effective_zipf >= 0 AND effective_zipf < 3
          ORDER BY updated_at DESC
          LIMIT 500
        ` as VocabularyWordRow[]
        : await sql`
          SELECT id, surface, normalized_surface, reading,
                 COALESCE(selection_zipf_override, zipf) AS zipf
          FROM words
          WHERE status = 'active'
            AND COALESCE(selection_zipf_override, zipf) >= 0
            AND COALESCE(selection_zipf_override, zipf) < 3
          ORDER BY updated_at DESC
          LIMIT 500
        ` as VocabularyWordRow[];
      return rows.map(vocabularyWord);
    },

    async loadWordPairs() {
      const sql = getVocabularyPostgresClient();
      const rows = expectedAppEnvironment() === "production"
        ? await sql`
          SELECT pair.id,
                 word_a.id AS word_a_id,
                 word_a.surface AS word_a_surface,
                 word_a.normalized_surface AS word_a_normalized_surface,
                 word_a.reading AS word_a_reading,
                 word_a.effective_zipf AS word_a_zipf,
                 word_b.id AS word_b_id,
                 word_b.surface AS word_b_surface,
                 word_b.normalized_surface AS word_b_normalized_surface,
                 word_b.reading AS word_b_reading,
                 word_b.effective_zipf AS word_b_zipf,
                 pair.relation, pair.pair_distance, pair.difficulty
          FROM active_word_pairs pair
          JOIN active_word_game_eligibility eligibility
            ON eligibility.subject_type = 'pair'
            AND eligibility.subject_id = pair.id
            AND eligibility.game_id = 'wordwolf'
          JOIN active_words word_a ON word_a.id = pair.word_a_id
          JOIN active_words word_b ON word_b.id = pair.word_b_id
          WHERE (eligibility.valid_from IS NULL OR eligibility.valid_from <= NOW())
            AND (eligibility.valid_until IS NULL OR eligibility.valid_until > NOW())
          ORDER BY pair.updated_at DESC
          LIMIT 500
        ` as VocabularyPairRow[]
        : await sql`
          SELECT pair.id,
                 word_a.id AS word_a_id,
                 word_a.surface AS word_a_surface,
                 word_a.normalized_surface AS word_a_normalized_surface,
                 word_a.reading AS word_a_reading,
                 COALESCE(word_a.selection_zipf_override, word_a.zipf) AS word_a_zipf,
                 word_b.id AS word_b_id,
                 word_b.surface AS word_b_surface,
                 word_b.normalized_surface AS word_b_normalized_surface,
                 word_b.reading AS word_b_reading,
                 COALESCE(word_b.selection_zipf_override, word_b.zipf) AS word_b_zipf,
                 pair.relation, pair.pair_distance, pair.difficulty
          FROM word_pairs pair
          JOIN word_game_eligibility eligibility
            ON eligibility.subject_type = 'pair'
            AND eligibility.subject_id = pair.id
            AND eligibility.game_id = 'wordwolf'
          JOIN words word_a ON word_a.id = pair.word_a_id
          JOIN words word_b ON word_b.id = pair.word_b_id
          WHERE pair.status = 'active'
            AND eligibility.enabled
            AND NOT eligibility.manually_suspended
            AND word_a.status = 'active'
            AND word_b.status = 'active'
            AND (eligibility.valid_from IS NULL OR eligibility.valid_from <= NOW())
            AND (eligibility.valid_until IS NULL OR eligibility.valid_until > NOW())
          ORDER BY pair.updated_at DESC
          LIMIT 500
        ` as VocabularyPairRow[];
      return rows.map((row) => ({
        internalId: row.id,
        first: vocabularyWord({
          id: row.word_a_id,
          surface: row.word_a_surface,
          normalized_surface: row.word_a_normalized_surface,
          reading: row.word_a_reading,
          zipf: row.word_a_zipf,
        }),
        second: vocabularyWord({
          id: row.word_b_id,
          surface: row.word_b_surface,
          normalized_surface: row.word_b_normalized_surface,
          reading: row.word_b_reading,
          zipf: row.word_b_zipf,
        }),
        difficulty: pairDifficulty(row.pair_distance, row.difficulty),
        relation: row.relation,
      }));
    },

    async loadDefinitions(words) {
      const vocabularyIds = words
        .filter((word) => word.source === "vocabulary" && uuidPattern.test(word.internalId))
        .map((word) => word.internalId);
      const normalizedSurfaces = words
        .filter((word) => word.source === "app")
        .map((word) => word.normalizedSurface);
      if (vocabularyIds.length === 0 && normalizedSurfaces.length === 0) return [];
      const sql = getVocabularyPostgresClient();
      const rows = expectedAppEnvironment() === "production"
        ? await sql`
          SELECT word.id AS word_id, word.surface, word.normalized_surface,
                 word.reading, word.effective_zipf AS zipf,
                 definition.short_definition
          FROM active_words word
          JOIN active_word_definitions definition ON definition.word_id = word.id
          WHERE word.id = ANY(${vocabularyIds}::uuid[])
             OR word.normalized_surface = ANY(${normalizedSurfaces}::text[])
          ORDER BY definition.updated_at DESC
        ` as VocabularyDefinitionRow[]
        : await sql`
          SELECT word.id AS word_id, word.surface, word.normalized_surface,
                 word.reading,
                 COALESCE(word.selection_zipf_override, word.zipf) AS zipf,
                 definition.short_definition
          FROM words word
          JOIN word_definitions definition ON definition.word_id = word.id
          WHERE word.status = 'active'
            AND definition.status = 'active'
            AND (
              word.id = ANY(${vocabularyIds}::uuid[])
              OR word.normalized_surface = ANY(${normalizedSurfaces}::text[])
            )
          ORDER BY definition.updated_at DESC
        ` as VocabularyDefinitionRow[];
      const requestedByVocabularyId = new Map(
        words
          .filter((word) => word.source === "vocabulary")
          .map((word) => [word.internalId, word]),
      );
      const requestedBySurface = new Map(
        words
          .filter((word) => word.source === "app")
          .map((word) => [word.normalizedSurface, word]),
      );
      const seen = new Set<string>();
      return rows.flatMap((row) => {
        const requested = requestedByVocabularyId.get(row.word_id)
          ?? requestedBySurface.get(row.normalized_surface);
        if (!requested || seen.has(requested.internalId)) return [];
        seen.add(requested.internalId);
        return [{
          word: {
            ...requested,
            surface: row.surface,
            normalizedSurface: row.normalized_surface,
            reading: row.reading,
            difficulty: rareDifficulty(row.zipf),
          },
          definition: row.short_definition,
        }];
      });
    },
  };
}

type OpaqueWordPayload = {
  version: 1;
  kind: "word";
  source: ContentWordSource;
  internalId: string;
  normalizedSurface: string;
};

type OpaquePairPayload = {
  version: 1;
  kind: "pair";
  internalId: string;
};

type OpaquePayload = OpaqueWordPayload | OpaquePairPayload;

function defaultIdSecret() {
  const secret = process.env.PLAYER_SESSION_SECRET ?? process.env.LLM_SESSION_SECRET;
  if (secret?.length && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "test") return "game-fields-sdk-content-test-secret";
  throw new Error("GAME_SDK_CONTENT_ID_SECRET_UNAVAILABLE");
}

function opaqueIdKey(secret: string) {
  return createHash("sha256")
    .update("game-fields-sdk-content:v1:")
    .update(secret)
    .digest();
}

function opaqueId(payload: OpaquePayload, secret: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", opaqueIdKey(secret), nonce);
  cipher.setAAD(Buffer.from("game-fields-sdk-content:v1", "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return `gfc1.${Buffer.concat([
    nonce,
    cipher.getAuthTag(),
    ciphertext,
  ]).toString("base64url")}`;
}

function decodeOpaqueId(value: string, secret: string): OpaquePayload | null {
  const [prefix, encoded, extra] = value.split(".");
  if (prefix !== "gfc1" || !encoded || extra) return null;
  try {
    const encrypted = Buffer.from(encoded, "base64url");
    if (encrypted.length <= 28) return null;
    const nonce = encrypted.subarray(0, 12);
    const authTag = encrypted.subarray(12, 28);
    const ciphertext = encrypted.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", opaqueIdKey(secret), nonce);
    decipher.setAAD(Buffer.from("game-fields-sdk-content:v1", "utf8"));
    decipher.setAuthTag(authTag);
    const parsed = JSON.parse(
      Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8"),
    ) as Record<string, unknown>;
    if (parsed.version !== 1 || (parsed.kind !== "word" && parsed.kind !== "pair")) return null;
    if (typeof parsed.internalId !== "string" || !parsed.internalId.trim()) return null;
    if (parsed.kind === "pair") return {
      version: 1,
      kind: "pair",
      internalId: parsed.internalId,
    };
    if (
      (parsed.source !== "app" && parsed.source !== "vocabulary")
      || typeof parsed.normalizedSurface !== "string"
      || !parsed.normalizedSurface.trim()
    ) return null;
    return {
      version: 1,
      kind: "word",
      source: parsed.source,
      internalId: parsed.internalId,
      normalizedSurface: parsed.normalizedSurface,
    };
  } catch {
    return null;
  }
}

function shuffle<T>(values: readonly T[], random: () => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const roll = Math.max(0, Math.min(0.999999999999, random()));
    const target = Math.floor(roll * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function publicWord(
  word: GameFieldsSdkContentWordRecord,
  secret: string,
  tags: readonly string[],
): GameSdkWordContent {
  return {
    id: opaqueId({
      version: 1,
      kind: "word",
      source: word.source,
      internalId: word.internalId,
      normalizedSurface: word.normalizedSurface,
    }, secret),
    surface: word.surface,
    reading: word.reading,
    difficulty: word.difficulty,
    tags,
  };
}

function selectGeneralWords(
  records: readonly GameFieldsSdkContentWordRecord[],
  difficulty: GeneralGameWordDifficulty,
  count: number,
  random: () => number,
) {
  const queues = {
    easy: shuffle(records.filter((word) => word.difficulty === "easy"), random),
    normal: shuffle(records.filter((word) => word.difficulty === "normal"), random),
    hard: shuffle(records.filter((word) => word.difficulty === "hard"), random),
  };
  const selected: GameFieldsSdkContentWordRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    const roll = Math.max(0, Math.min(0.999999999999, random()));
    const weights = generalGameWordDifficultyWeights[difficulty];
    const band = roll < weights.easy
      ? "easy"
      : roll < weights.easy + weights.normal
        ? "normal"
        : "hard";
    const word = queues[band].pop();
    if (!word) throw new Error("GAME_SDK_CONTENT_UNAVAILABLE");
    selected.push(word);
  }
  return selected;
}

export function createGameFieldsSdkContentSource(options: {
  repository?: GameFieldsSdkContentRepository;
  idSecret?: string;
  random?: () => number;
} = {}): GameSdkContentSource {
  const repository = options.repository ?? createPostgresGameFieldsSdkContentRepository();
  const random = options.random ?? Math.random;
  const secret = options.idSecret ?? defaultIdSecret();

  return defineGameSdkContentSource({
    async drawWords(request) {
      const excludedIds = new Set(
        (request.excludeIds ?? []).flatMap((id) => {
          const payload = decodeOpaqueId(id, secret);
          return payload?.kind === "word"
            ? [`${payload.source}:${payload.internalId}`]
            : [];
        }),
      );
      const excludedSurfaces = new Set(
        (request.excludeSurfaces ?? []).map(normalizeGeneralGameWord),
      );
      const available = (request.pool === "general-words"
        ? await repository.loadGeneralWords()
        : await repository.loadRareWords())
        .filter((word) => (
          !excludedIds.has(`${word.source}:${word.internalId}`)
          && !excludedSurfaces.has(normalizeGeneralGameWord(word.surface))
        ));
      const selected = request.pool === "general-words"
        ? selectGeneralWords(available, request.difficulty ?? "normal", request.count, random)
        : shuffle(
            available.filter((word) => word.difficulty === (request.difficulty ?? "normal")),
            random,
          ).slice(0, request.count);
      if (selected.length !== request.count) throw new Error("GAME_SDK_CONTENT_UNAVAILABLE");
      return selected.map((word) => publicWord(word, secret, [request.pool]));
    },

    async drawWordPairs(request) {
      const excludedIds = new Set(
        (request.excludeIds ?? []).flatMap((id) => {
          const payload = decodeOpaqueId(id, secret);
          return payload?.kind === "pair" ? [payload.internalId] : [];
        }),
      );
      const selected = shuffle(
        (await repository.loadWordPairs()).filter((pair) => (
          pair.difficulty === (request.difficulty ?? "normal")
          && !excludedIds.has(pair.internalId)
        )),
        random,
      ).slice(0, request.count);
      if (selected.length !== request.count) throw new Error("GAME_SDK_CONTENT_UNAVAILABLE");
      return selected.map((pair): GameSdkWordPairContent => ({
        id: opaqueId({
          version: 1,
          kind: "pair",
          internalId: pair.internalId,
        }, secret),
        first: publicWord(pair.first, secret, ["word-pairs"]),
        second: publicWord(pair.second, secret, ["word-pairs"]),
        difficulty: pair.difficulty,
        relation: pair.relation,
      }));
    },

    async findDefinitions(request) {
      const decoded = request.wordIds.flatMap((id) => {
        const payload = decodeOpaqueId(id, secret);
        if (payload?.kind !== "word") return [];
        return [{
          publicId: id,
          record: {
            source: payload.source,
            internalId: payload.internalId,
            normalizedSurface: payload.normalizedSurface,
            surface: "",
            reading: null,
            difficulty: "normal" as const,
          },
        }];
      });
      const definitions = await repository.loadDefinitions(decoded.map((item) => item.record));
      const publicIdByRecord = new Map(decoded.map((item) => [
        `${item.record.source}:${item.record.internalId}`,
        item.publicId,
      ]));
      return definitions.flatMap((definition): GameSdkWordDefinitionContent[] => {
        const wordId = publicIdByRecord.get(
          `${definition.word.source}:${definition.word.internalId}`,
        );
        return wordId ? [{
          wordId,
          surface: definition.word.surface,
          definition: definition.definition,
        }] : [];
      });
    },
  });
}
