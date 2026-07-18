import { createHash } from "node:crypto";
import type {
  VocabularyCatalogRepository,
  VocabularyDefinitionQuery,
  VocabularyPairQuery,
  VocabularyStatus,
  VocabularyWordQuery,
  Word,
  WordDefinition,
  WordPair,
} from "./vocabulary-catalog-types.ts";
import {
  assertVocabularyDraftWriteAllowed,
  getVocabularyPostgresClient,
} from "./vocabulary-postgres-store.ts";

type WordRow = {
  id: string; surface: string; reading: string | null; normalized_surface: string;
  part_of_speech: string | null; proper_noun: boolean; character_count: number;
  zipf: number | null; status: VocabularyStatus;
};
type PairRow = {
  id: string; word_a_id: string; word_b_id: string; relation: string | null;
  difficulty: string | null; pair_distance: string | null;
  requested_pair_distance: string | null; status: VocabularyStatus;
};
type DefinitionRow = {
  id: string; word_id: string; short_definition: string; status: VocabularyStatus;
};

function statusesForRead(statuses: VocabularyStatus[] | undefined) {
  const requested = statuses?.filter((status, index, values) => values.indexOf(status) === index);
  return requested?.length ? requested : ["active" satisfies VocabularyStatus];
}

export class PostgresVocabularyCatalogRepository implements VocabularyCatalogRepository {
  async findWords(query: VocabularyWordQuery): Promise<Word[]> {
    const sql = getVocabularyPostgresClient();
    const statuses = statusesForRead(query.statuses);
    const limit = Math.min(500, Math.max(1, Math.floor(query.limit)));
    const effectiveZipfEquals = query.effectiveZipfEquals ?? null;
    const effectiveZipfMinExclusive = query.effectiveZipfMinExclusive ?? null;
    const effectiveZipfMaxExclusive = query.effectiveZipfMaxExclusive ?? null;
    const rows = process.env.APP_ENV === "production"
      ? query.gameId === "tahoiya" ? await sql`
      SELECT w.id, w.surface, w.reading, w.normalized_surface, w.part_of_speech,
             w.proper_noun, w.character_count, w.effective_zipf AS zipf, w.status
      FROM active_words w
      WHERE w.effective_zipf >= 0 AND w.effective_zipf < 3
        AND (${effectiveZipfEquals}::double precision IS NULL OR w.effective_zipf = ${effectiveZipfEquals})
        AND (${effectiveZipfMinExclusive}::double precision IS NULL OR w.effective_zipf > ${effectiveZipfMinExclusive})
        AND (${effectiveZipfMaxExclusive}::double precision IS NULL OR w.effective_zipf < ${effectiveZipfMaxExclusive})
      ORDER BY w.updated_at DESC LIMIT ${limit}
    ` as WordRow[] : await sql`
      SELECT w.id, w.surface, w.reading, w.normalized_surface, w.part_of_speech,
             w.proper_noun, w.character_count, w.effective_zipf AS zipf, w.status
      FROM active_words w
      JOIN active_word_game_eligibility e ON e.subject_type = 'word' AND e.subject_id = w.id
      WHERE e.game_id = ${query.gameId}
        AND w.effective_zipf >= 3
        AND (e.valid_from IS NULL OR e.valid_from <= NOW())
        AND (e.valid_until IS NULL OR e.valid_until > NOW())
      ORDER BY w.updated_at DESC LIMIT ${limit}
    ` as WordRow[]
      : query.gameId === "tahoiya" ? await sql`
      SELECT w.id, w.surface, w.reading, w.normalized_surface, w.part_of_speech,
             w.proper_noun, w.character_count,
             COALESCE(w.selection_zipf_override, w.zipf) AS zipf, w.status
      FROM words w
      WHERE COALESCE(w.selection_zipf_override, w.zipf) >= 0
        AND COALESCE(w.selection_zipf_override, w.zipf) < 3
        AND (${effectiveZipfEquals}::double precision IS NULL OR COALESCE(w.selection_zipf_override, w.zipf) = ${effectiveZipfEquals})
        AND (${effectiveZipfMinExclusive}::double precision IS NULL OR COALESCE(w.selection_zipf_override, w.zipf) > ${effectiveZipfMinExclusive})
        AND (${effectiveZipfMaxExclusive}::double precision IS NULL OR COALESCE(w.selection_zipf_override, w.zipf) < ${effectiveZipfMaxExclusive})
        AND w.status = ANY(${statuses}::vocabulary_status[])
      ORDER BY w.updated_at DESC LIMIT ${limit}
    ` as WordRow[] : await sql`
      SELECT w.id, w.surface, w.reading, w.normalized_surface, w.part_of_speech,
             w.proper_noun, w.character_count,
             COALESCE(w.selection_zipf_override, w.zipf) AS zipf, w.status
      FROM words w
      JOIN word_game_eligibility e ON e.subject_type = 'word' AND e.subject_id = w.id
      WHERE e.game_id = ${query.gameId} AND e.enabled AND NOT e.manually_suspended
        AND COALESCE(w.selection_zipf_override, w.zipf) >= 3
        AND w.status = ANY(${statuses}::vocabulary_status[])
        AND (e.valid_from IS NULL OR e.valid_from <= NOW())
        AND (e.valid_until IS NULL OR e.valid_until > NOW())
      ORDER BY w.updated_at DESC LIMIT ${limit}
    ` as WordRow[];
    return rows.map((row) => ({
      id: row.id, surface: row.surface, reading: row.reading,
      normalizedSurface: row.normalized_surface, partOfSpeech: row.part_of_speech,
      properNoun: row.proper_noun, characterCount: row.character_count,
      zipf: row.zipf === null ? null : Number(row.zipf), status: row.status,
    }));
  }

  async findPairs(query: VocabularyPairQuery): Promise<WordPair[]> {
    const sql = getVocabularyPostgresClient();
    const statuses = statusesForRead(query.statuses);
    const limit = Math.min(500, Math.max(1, Math.floor(query.limit)));
    const rows = process.env.APP_ENV === "production" ? await sql`
      SELECT p.id, p.word_a_id, p.word_b_id, p.relation, p.difficulty,
             p.pair_distance, p.requested_pair_distance, p.status
      FROM active_word_pairs p
      JOIN active_word_game_eligibility e ON e.subject_type = 'pair' AND e.subject_id = p.id
      WHERE e.game_id = ${query.gameId}
        AND (e.valid_from IS NULL OR e.valid_from <= NOW())
        AND (e.valid_until IS NULL OR e.valid_until > NOW())
      ORDER BY p.updated_at DESC LIMIT ${limit}
    ` as PairRow[] : await sql`
      SELECT p.id, p.word_a_id, p.word_b_id, p.relation, p.difficulty,
             p.pair_distance, p.requested_pair_distance, p.status
      FROM word_pairs p
      JOIN word_game_eligibility e ON e.subject_type = 'pair' AND e.subject_id = p.id
      WHERE e.game_id = ${query.gameId} AND e.enabled AND NOT e.manually_suspended
        AND p.status = ANY(${statuses}::vocabulary_status[])
        AND (e.valid_from IS NULL OR e.valid_from <= NOW())
        AND (e.valid_until IS NULL OR e.valid_until > NOW())
      ORDER BY p.updated_at DESC LIMIT ${limit}
    ` as PairRow[];
    return rows.map((row) => ({
      id: row.id, wordAId: row.word_a_id, wordBId: row.word_b_id,
      relation: row.relation, difficulty: row.difficulty,
      pairDistance: row.pair_distance, requestedPairDistance: row.requested_pair_distance,
      status: row.status,
    }));
  }

  async findDefinitions(query: VocabularyDefinitionQuery): Promise<WordDefinition[]> {
    const sql = getVocabularyPostgresClient();
    const statuses = statusesForRead(query.statuses);
    const rows = process.env.APP_ENV === "production" ? await sql`
      SELECT id, word_id, short_definition, status FROM active_word_definitions
      WHERE word_id = ${query.wordId}
        AND (${query.gameId ?? null}::text IS NULL OR display_game_id IS NULL OR display_game_id = ${query.gameId ?? null})
      ORDER BY updated_at DESC LIMIT 50
    ` as DefinitionRow[] : await sql`
      SELECT id, word_id, short_definition, status FROM word_definitions
      WHERE word_id = ${query.wordId}
        AND (${query.gameId ?? null}::text IS NULL OR display_game_id IS NULL OR display_game_id = ${query.gameId ?? null})
        AND status = ANY(${statuses}::vocabulary_status[])
      ORDER BY updated_at DESC LIMIT 50
    ` as DefinitionRow[];
    return rows.map((row) => ({
      id: row.id, wordId: row.word_id, shortDefinition: row.short_definition, status: row.status,
    }));
  }

  async createDraft(input: Parameters<VocabularyCatalogRepository["createDraft"]>[0]) {
    assertVocabularyDraftWriteAllowed();
    const serialized = JSON.stringify(input.payload);
    if (serialized.length > 50_000) throw new Error("VOCABULARY_DRAFT_PAYLOAD_TOO_LARGE");
    const deduplicationKey = createHash("sha256").update(JSON.stringify({
      kind: input.kind,
      sourceEnvironment: input.provenance.sourceEnvironment,
      sourceReference: input.provenance.sourceReference ?? null,
      payload: input.payload,
    })).digest("hex");
    const sql = getVocabularyPostgresClient();
    const rows = await sql`
      INSERT INTO vocabulary_draft_submissions (
        deduplication_key, kind, payload, source_type, source_environment, source_reference,
        provider, model, prompt_version, generation_batch_id, created_by
      ) VALUES (
        ${deduplicationKey}, ${input.kind}, ${serialized}::jsonb, ${input.provenance.sourceType},
        ${input.provenance.sourceEnvironment}, ${input.provenance.sourceReference ?? null},
        ${input.provenance.provider ?? null}, ${input.provenance.model ?? null},
        ${input.provenance.promptVersion ?? null}, ${input.provenance.generationBatchId ?? null},
        ${input.provenance.createdBy ?? null}
      ) ON CONFLICT (deduplication_key) DO NOTHING RETURNING id
    ` as Array<{ id: string }>;
    if (rows[0]?.id) return rows[0].id;
    const existing = await sql`
      SELECT id FROM vocabulary_draft_submissions WHERE deduplication_key = ${deduplicationKey} LIMIT 1
    ` as Array<{ id: string }>;
    if (!existing[0]?.id) throw new Error("VOCABULARY_DRAFT_INSERT_FAILED");
    return existing[0].id;
  }
}
