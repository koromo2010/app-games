import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { VocabularySourceEnvironment, VocabularySourceType } from "./vocabulary-catalog-types.ts";

export type VocabularyDraftSubmission = {
  id: string;
  kind: "word" | "definition" | "pair" | "group";
  payload: Record<string, unknown>;
  sourceType: VocabularySourceType;
  sourceEnvironment: VocabularySourceEnvironment;
  sourceReference: string | null;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  createdBy: string | null;
  createdAt: string;
};

type DraftRow = {
  id: string; kind: VocabularyDraftSubmission["kind"]; payload: Record<string, unknown>;
  source_type: VocabularySourceType; source_environment: VocabularySourceEnvironment;
  source_reference: string | null; provider: string | null; model: string | null;
  prompt_version: string | null; created_by: string | null; created_at: string;
};

let client: NeonQueryFunction<boolean, boolean> | null = null;
let clientUrl = "";

function adminClient() {
  const url = process.env.VOCABULARY_ADMIN_DATABASE_URL?.trim();
  if (!url) throw new Error("VOCABULARY_ADMIN_STORE_NOT_CONFIGURED");
  if (!client || clientUrl !== url) { client = neon(url); clientUrl = url; }
  return client;
}

function text(value: unknown, maximum = 500) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function normalizedWord(value: unknown) {
  const surface = text(value, 100);
  return surface ? { surface, normalized: surface.toLocaleLowerCase("ja"), length: Array.from(surface).length } : null;
}

function fromRow(row: DraftRow): VocabularyDraftSubmission {
  return { id: row.id, kind: row.kind, payload: row.payload, sourceType: row.source_type,
    sourceEnvironment: row.source_environment, sourceReference: row.source_reference,
    provider: row.provider, model: row.model, promptVersion: row.prompt_version,
    createdBy: row.created_by, createdAt: row.created_at };
}

export async function listVocabularyDrafts(limit = 100) {
  const rows = await adminClient()`
    SELECT id, kind, payload, source_type, source_environment, source_reference,
      provider, model, prompt_version, created_by, created_at
    FROM vocabulary_draft_submissions WHERE status = 'draft'
    ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(200, Math.floor(limit)))}
  ` as DraftRow[];
  return rows.map(fromRow);
}

async function activatePair(draft: VocabularyDraftSubmission, reviewedBy: string) {
  const village = normalizedWord(draft.payload.villageWord);
  const wolf = normalizedWord(draft.payload.wolfWord);
  const gameId = text(draft.payload.gameId, 80);
  if (!village || !wolf || !gameId || village.normalized === wolf.normalized) throw new Error("VOCABULARY_DRAFT_INVALID");
  const words = [village, wolf].sort((a, b) => a.normalized.localeCompare(b.normalized, "ja"));
  const sql = adminClient();
  const rows = await sql`
    WITH first_word AS (
      INSERT INTO words (surface, normalized_surface, character_count, status, source_type, source_environment,
        source_reference, provider, model, prompt_version, created_by, reviewed_at, reviewed_by)
      VALUES (${words[0].surface}, ${words[0].normalized}, ${words[0].length}, 'active', ${draft.sourceType},
        ${draft.sourceEnvironment}, ${draft.sourceReference}, ${draft.provider}, ${draft.model}, ${draft.promptVersion},
        ${draft.createdBy}, NOW(), ${reviewedBy})
      ON CONFLICT (normalized_surface, (COALESCE(reading, ''))) DO UPDATE SET updated_at = NOW()
      RETURNING id
    ), second_word AS (
      INSERT INTO words (surface, normalized_surface, character_count, status, source_type, source_environment,
        source_reference, provider, model, prompt_version, created_by, reviewed_at, reviewed_by)
      VALUES (${words[1].surface}, ${words[1].normalized}, ${words[1].length}, 'active', ${draft.sourceType},
        ${draft.sourceEnvironment}, ${draft.sourceReference}, ${draft.provider}, ${draft.model}, ${draft.promptVersion},
        ${draft.createdBy}, NOW(), ${reviewedBy})
      ON CONFLICT (normalized_surface, (COALESCE(reading, ''))) DO UPDATE SET updated_at = NOW()
      RETURNING id
    ), pair AS (
      INSERT INTO word_pairs (word_a_id, word_b_id, relation, difficulty, status, source_type, source_environment,
        source_reference, provider, model, prompt_version, created_by, reviewed_at, reviewed_by)
      SELECT LEAST(first_word.id, second_word.id), GREATEST(first_word.id, second_word.id),
        ${text(draft.payload.reason)}, ${text(draft.payload.pairDistance, 80)}, 'active', ${draft.sourceType},
        ${draft.sourceEnvironment}, ${draft.sourceReference}, ${draft.provider}, ${draft.model}, ${draft.promptVersion},
        ${draft.createdBy}, NOW(), ${reviewedBy} FROM first_word, second_word
      ON CONFLICT (word_a_id, word_b_id) DO UPDATE SET status = 'active', reviewed_at = NOW(), reviewed_by = ${reviewedBy}, updated_at = NOW()
      RETURNING id
    ), eligibility AS (
      INSERT INTO word_game_eligibility (subject_type, subject_id, game_id, enabled)
      SELECT 'pair', id, ${gameId}, TRUE FROM pair
      ON CONFLICT (subject_type, subject_id, game_id) DO UPDATE SET enabled = TRUE, manually_suspended = FALSE, updated_at = NOW()
    )
    UPDATE vocabulary_draft_submissions SET status = 'active', reviewed_at = NOW(), reviewed_by = ${reviewedBy},
      materialized_subject_type = 'pair', materialized_subject_id = (SELECT id FROM pair)
    WHERE id = ${draft.id} AND status = 'draft' RETURNING materialized_subject_id AS id
  ` as Array<{ id: string }>;
  if (!rows[0]?.id) throw new Error("VOCABULARY_DRAFT_ALREADY_REVIEWED");
  return rows[0].id;
}

async function activateDefinition(draft: VocabularyDraftSubmission, reviewedBy: string) {
  const word = normalizedWord(draft.payload.word);
  const definition = text(draft.payload.realDefinition);
  const reading = text(draft.payload.reading, 100);
  const gameId = text(draft.payload.gameId, 80);
  if (!word || !definition || !gameId) throw new Error("VOCABULARY_DRAFT_INVALID");
  const sql = adminClient();
  const rows = await sql`
    WITH selected_word AS (
      INSERT INTO words (surface, reading, normalized_surface, character_count, status, source_type, source_environment,
        source_reference, provider, model, prompt_version, created_by, reviewed_at, reviewed_by)
      VALUES (${word.surface}, ${reading}, ${word.normalized}, ${word.length}, 'active', ${draft.sourceType},
        ${draft.sourceEnvironment}, ${draft.sourceReference}, ${draft.provider}, ${draft.model}, ${draft.promptVersion},
        ${draft.createdBy}, NOW(), ${reviewedBy})
      ON CONFLICT (normalized_surface, (COALESCE(reading, ''))) DO UPDATE SET status = 'active', updated_at = NOW()
      RETURNING id
    ), definition AS (
      INSERT INTO word_definitions (word_id, short_definition, display_game_id, status, source_type, source_environment,
        source_reference, provider, model, prompt_version, created_by, reviewed_at, reviewed_by)
      SELECT id, ${definition}, ${gameId}, 'active', ${draft.sourceType}, ${draft.sourceEnvironment},
        ${draft.sourceReference}, ${draft.provider}, ${draft.model}, ${draft.promptVersion}, ${draft.createdBy}, NOW(), ${reviewedBy}
      FROM selected_word RETURNING id
    )
    UPDATE vocabulary_draft_submissions SET status = 'active', reviewed_at = NOW(), reviewed_by = ${reviewedBy},
      materialized_subject_type = 'definition', materialized_subject_id = (SELECT id FROM definition)
    WHERE id = ${draft.id} AND status = 'draft' RETURNING materialized_subject_id AS id
  ` as Array<{ id: string }>;
  if (!rows[0]?.id) throw new Error("VOCABULARY_DRAFT_ALREADY_REVIEWED");
  return rows[0].id;
}

export async function reviewVocabularyDraft(id: string, decision: "active" | "rejected", reviewedBy: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("VOCABULARY_DRAFT_INVALID");
  const sql = adminClient();
  const drafts = await sql`
    SELECT id, kind, payload, source_type, source_environment, source_reference,
      provider, model, prompt_version, created_by, created_at
    FROM vocabulary_draft_submissions WHERE id = ${id} AND status = 'draft' LIMIT 1
  ` as DraftRow[];
  const draft = drafts[0] ? fromRow(drafts[0]) : null;
  if (!draft) throw new Error("VOCABULARY_DRAFT_NOT_FOUND");
  if (decision === "rejected") {
    const rows = await sql`UPDATE vocabulary_draft_submissions SET status = 'rejected', reviewed_at = NOW(), reviewed_by = ${reviewedBy}
      WHERE id = ${id} AND status = 'draft' RETURNING id` as Array<{ id: string }>;
    if (!rows[0]) throw new Error("VOCABULARY_DRAFT_ALREADY_REVIEWED");
    return { id, status: decision, subjectId: null };
  }
  const subjectId = draft.kind === "pair" ? await activatePair(draft, reviewedBy)
    : draft.kind === "definition" ? await activateDefinition(draft, reviewedBy)
    : (() => { throw new Error("VOCABULARY_DRAFT_KIND_NOT_SUPPORTED"); })();
  return { id, status: decision, subjectId };
}
