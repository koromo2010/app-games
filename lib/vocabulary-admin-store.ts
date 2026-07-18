import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { VocabularySourceEnvironment, VocabularySourceType } from "./vocabulary-catalog-types.ts";
import { resolveVocabularyEvaluationDecision, type VocabularyEvaluationDecision } from "./vocabulary-review.ts";

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

export type VocabularyWordGameEvaluation = {
  id: string;
  wordId: string;
  word: string;
  reading: string | null;
  zipf: number | null;
  gameId: string;
  pairDistance: string | null;
  llmDecision: VocabularyEvaluationDecision;
  resolvedDecision: VocabularyEvaluationDecision;
  usagePenalty: number;
  gamePenalty: number;
  feedbackAdjustment: number;
  safetyFlags: string[];
  reasonCode: string;
  pairReason: string;
  partnerText: string | null;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  generationBatchId: string | null;
  createdAt: string;
  humanAcceptCount: number;
  humanRejectCount: number;
  myVote: VocabularyEvaluationDecision | null;
  myComment: string | null;
  linkedDraftId: string | null;
  linkedDraftStatus: "draft" | "active" | "rejected" | null;
  materializedPairId: string | null;
};

type EvaluationRow = {
  id: string; word_id: string; word: string; reading: string | null; zipf: number | string | null;
  game_id: string; requested_pair_distance: string | null; decision: VocabularyEvaluationDecision;
  usage_penalty: number | string; game_penalty: number | string; feedback_adjustment: number | string;
  safety_flags: string[]; reason_code: string; pair_reason: string; partner_text: string | null;
  provider: string | null; model: string | null; prompt_version: string | null;
  generation_batch_id: string | null; created_at: string;
  human_accept_count: number | string; human_reject_count: number | string;
  my_vote: VocabularyEvaluationDecision | null; my_comment: string | null;
  linked_draft_id: string | null; linked_draft_status: "draft" | "active" | "rejected" | null;
  materialized_pair_id: string | null;
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

function uuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function evaluationFromRow(row: EvaluationRow): VocabularyWordGameEvaluation {
  const humanAcceptCount = number(row.human_accept_count);
  const humanRejectCount = number(row.human_reject_count);
  return {
    id: row.id,
    wordId: row.word_id,
    word: row.word,
    reading: row.reading,
    zipf: row.zipf === null ? null : number(row.zipf),
    gameId: row.game_id,
    pairDistance: row.requested_pair_distance,
    llmDecision: row.decision,
    resolvedDecision: resolveVocabularyEvaluationDecision(row.decision, humanAcceptCount, humanRejectCount),
    usagePenalty: number(row.usage_penalty),
    gamePenalty: number(row.game_penalty),
    feedbackAdjustment: number(row.feedback_adjustment),
    safetyFlags: Array.isArray(row.safety_flags) ? row.safety_flags : [],
    reasonCode: row.reason_code,
    pairReason: row.pair_reason,
    partnerText: row.partner_text,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    generationBatchId: row.generation_batch_id,
    createdAt: row.created_at,
    humanAcceptCount,
    humanRejectCount,
    myVote: row.my_vote,
    myComment: row.my_comment,
    linkedDraftId: row.linked_draft_id,
    linkedDraftStatus: row.linked_draft_status,
    materializedPairId: row.materialized_pair_id,
  };
}

async function hasHumanVoteTable() {
  const rows = await adminClient()`SELECT to_regclass('public.word_game_human_votes')::text AS table_name` as Array<{ table_name: string | null }>;
  return Boolean(rows[0]?.table_name);
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

export async function listVocabularyWordGameEvaluations(voter: string, limit = 100) {
  const sql = adminClient();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const votingEnabled = await hasHumanVoteTable();
  const rows = votingEnabled
    ? await sql`
      SELECT evaluation.id, evaluation.word_id, word.surface AS word, word.reading, word.zipf,
        evaluation.game_id, evaluation.requested_pair_distance, evaluation.decision,
        evaluation.usage_penalty, evaluation.game_penalty, evaluation.feedback_adjustment,
        evaluation.safety_flags, evaluation.reason_code, evaluation.pair_reason,
        evaluation.partner_text, evaluation.provider, evaluation.model, evaluation.prompt_version,
        evaluation.generation_batch_id, evaluation.created_at,
        COALESCE(summary.accept_count, 0)::bigint AS human_accept_count,
        COALESCE(summary.reject_count, 0)::bigint AS human_reject_count,
        mine.decision AS my_vote, mine.comment AS my_comment,
        linked_draft.id AS linked_draft_id, linked_draft.status::text AS linked_draft_status,
        linked_draft.materialized_subject_id AS materialized_pair_id
      FROM word_game_evaluations evaluation
      JOIN words word ON word.id = evaluation.word_id
      LEFT JOIN word_game_human_vote_summary summary ON summary.evaluation_id = evaluation.id
      LEFT JOIN word_game_human_votes mine
        ON mine.evaluation_id = evaluation.id AND mine.voter = ${voter}
      LEFT JOIN LATERAL (
        SELECT draft.id, draft.status, draft.materialized_subject_id
        FROM vocabulary_draft_submissions draft
        WHERE draft.kind = 'pair'
          AND draft.payload->>'gameId' = 'wordwolf'
          AND draft.payload->>'anchorWordId' = evaluation.word_id::text
          AND draft.payload->>'pairDistance' = evaluation.requested_pair_distance
          AND (
            draft.payload->>'villageWord' = evaluation.partner_text
            OR draft.payload->>'wolfWord' = evaluation.partner_text
          )
        ORDER BY CASE draft.status WHEN 'draft' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
          draft.created_at DESC, draft.id DESC
        LIMIT 1
      ) linked_draft ON TRUE
      WHERE evaluation.game_id = 'wordwolf'
      ORDER BY evaluation.created_at DESC, evaluation.id DESC
      LIMIT ${safeLimit}
    ` as EvaluationRow[]
    : await sql`
      SELECT evaluation.id, evaluation.word_id, word.surface AS word, word.reading, word.zipf,
        evaluation.game_id, evaluation.requested_pair_distance, evaluation.decision,
        evaluation.usage_penalty, evaluation.game_penalty, evaluation.feedback_adjustment,
        evaluation.safety_flags, evaluation.reason_code, evaluation.pair_reason,
        evaluation.partner_text, evaluation.provider, evaluation.model, evaluation.prompt_version,
        evaluation.generation_batch_id, evaluation.created_at,
        0::bigint AS human_accept_count, 0::bigint AS human_reject_count,
        NULL::text AS my_vote, NULL::text AS my_comment,
        linked_draft.id AS linked_draft_id, linked_draft.status::text AS linked_draft_status,
        linked_draft.materialized_subject_id AS materialized_pair_id
      FROM word_game_evaluations evaluation
      JOIN words word ON word.id = evaluation.word_id
      LEFT JOIN LATERAL (
        SELECT draft.id, draft.status, draft.materialized_subject_id
        FROM vocabulary_draft_submissions draft
        WHERE draft.kind = 'pair'
          AND draft.payload->>'gameId' = 'wordwolf'
          AND draft.payload->>'anchorWordId' = evaluation.word_id::text
          AND draft.payload->>'pairDistance' = evaluation.requested_pair_distance
          AND (
            draft.payload->>'villageWord' = evaluation.partner_text
            OR draft.payload->>'wolfWord' = evaluation.partner_text
          )
        ORDER BY CASE draft.status WHEN 'draft' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
          draft.created_at DESC, draft.id DESC
        LIMIT 1
      ) linked_draft ON TRUE
      WHERE evaluation.game_id = 'wordwolf'
      ORDER BY evaluation.created_at DESC, evaluation.id DESC
      LIMIT ${safeLimit}
    ` as EvaluationRow[];
  return { evaluations: rows.map(evaluationFromRow), votingEnabled };
}

export async function castVocabularyWordGameVote(
  evaluationId: string,
  decision: VocabularyEvaluationDecision,
  voter: string,
  comment: string | null,
) {
  if (!uuid(evaluationId) || (decision !== "accept" && decision !== "reject")) {
    throw new Error("VOCABULARY_EVALUATION_VOTE_INVALID");
  }
  const normalizedVoter = text(voter, 320);
  const normalizedComment = comment === null ? null : text(comment, 500);
  if (comment !== null && comment.trim() && !normalizedComment) {
    throw new Error("VOCABULARY_EVALUATION_VOTE_INVALID");
  }
  if (!normalizedVoter) throw new Error("VOCABULARY_EVALUATION_VOTE_INVALID");
  if (!await hasHumanVoteTable()) throw new Error("VOCABULARY_HUMAN_VOTES_NOT_CONFIGURED");
  const sql = adminClient();
  const previousRows = await sql`
    SELECT decision, comment FROM word_game_human_votes
    WHERE evaluation_id = ${evaluationId}::uuid AND voter = ${normalizedVoter}
    LIMIT 1
  ` as Array<{ decision: VocabularyEvaluationDecision; comment: string | null }>;
  const saved = await sql`
    INSERT INTO word_game_human_votes (evaluation_id, voter, decision, comment)
    SELECT id, ${normalizedVoter}, ${decision}, ${normalizedComment}
    FROM word_game_evaluations
    WHERE id = ${evaluationId}::uuid AND game_id = 'wordwolf'
    ON CONFLICT (evaluation_id, voter) DO UPDATE SET
      decision = EXCLUDED.decision,
      comment = EXCLUDED.comment
    RETURNING evaluation_id
  ` as Array<{ evaluation_id: string }>;
  if (!saved[0]) throw new Error("VOCABULARY_EVALUATION_NOT_FOUND");
  const rows = await sql`
    SELECT evaluation_id,
      COUNT(*) FILTER (WHERE decision = 'accept')::bigint AS accept_count,
      COUNT(*) FILTER (WHERE decision = 'reject')::bigint AS reject_count
    FROM word_game_human_votes
    WHERE evaluation_id = ${evaluationId}::uuid
    GROUP BY evaluation_id
  ` as Array<{ evaluation_id: string; accept_count: number | string; reject_count: number | string }>;
  const row = rows[0];
  if (!row) throw new Error("VOCABULARY_EVALUATION_NOT_FOUND");
  const humanAcceptCount = number(row.accept_count);
  const humanRejectCount = number(row.reject_count);
  return {
    evaluationId: row.evaluation_id,
    decision,
    previousDecision: previousRows[0]?.decision ?? null,
    comment: normalizedComment,
    previousComment: previousRows[0]?.comment ?? null,
    humanAcceptCount,
    humanRejectCount,
  };
}

async function activatePair(draft: VocabularyDraftSubmission, reviewedBy: string) {
  const village = normalizedWord(draft.payload.villageWord);
  const wolf = normalizedWord(draft.payload.wolfWord);
  const gameId = text(draft.payload.gameId, 80);
  if (!village || !wolf || !gameId || village.normalized === wolf.normalized) throw new Error("VOCABULARY_DRAFT_INVALID");
  const preferredBySurface = new Map<string, string | null>([
    [village.normalized, null],
    [wolf.normalized, null],
  ]);
  const anchorSurface = text(draft.payload.anchorWord, 100)?.toLocaleLowerCase("ja");
  const anchorId = uuid(draft.payload.anchorWordId);
  const partnerId = uuid(draft.payload.partnerWordId);
  if (anchorSurface === village.normalized) {
    preferredBySurface.set(village.normalized, anchorId);
    preferredBySurface.set(wolf.normalized, partnerId);
  } else if (anchorSurface === wolf.normalized) {
    preferredBySurface.set(wolf.normalized, anchorId);
    preferredBySurface.set(village.normalized, partnerId);
  }
  const words = [village, wolf]
    .sort((a, b) => a.normalized.localeCompare(b.normalized, "ja"))
    .map((word) => ({ ...word, preferredId: preferredBySurface.get(word.normalized) ?? null }));
  const sql = adminClient();
  const rows = await sql`
    WITH first_existing AS (
      SELECT id FROM words
      WHERE (${words[0].preferredId}::uuid IS NOT NULL AND id = ${words[0].preferredId}::uuid)
        OR normalized_surface = ${words[0].normalized}
      ORDER BY CASE WHEN id = ${words[0].preferredId}::uuid THEN 0 ELSE 1 END,
        CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1
    ), first_inserted AS (
      INSERT INTO words (surface, normalized_surface, character_count, status, source_type, source_environment,
        source_reference, provider, model, prompt_version, created_by, reviewed_at, reviewed_by)
      SELECT ${words[0].surface}, ${words[0].normalized}, ${words[0].length}, 'active', ${draft.sourceType},
        ${draft.sourceEnvironment}, ${draft.sourceReference}, ${draft.provider}, ${draft.model}, ${draft.promptVersion},
        ${draft.createdBy}, NOW(), ${reviewedBy}
      WHERE NOT EXISTS (SELECT 1 FROM first_existing)
      ON CONFLICT (normalized_surface, (COALESCE(reading, ''))) DO UPDATE SET updated_at = NOW()
      RETURNING id
    ), first_word AS (
      SELECT id FROM first_existing UNION ALL SELECT id FROM first_inserted LIMIT 1
    ), second_existing AS (
      SELECT id FROM words
      WHERE (${words[1].preferredId}::uuid IS NOT NULL AND id = ${words[1].preferredId}::uuid)
        OR normalized_surface = ${words[1].normalized}
      ORDER BY CASE WHEN id = ${words[1].preferredId}::uuid THEN 0 ELSE 1 END,
        CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1
    ), second_inserted AS (
      INSERT INTO words (surface, normalized_surface, character_count, status, source_type, source_environment,
        source_reference, provider, model, prompt_version, created_by, reviewed_at, reviewed_by)
      SELECT ${words[1].surface}, ${words[1].normalized}, ${words[1].length}, 'active', ${draft.sourceType},
        ${draft.sourceEnvironment}, ${draft.sourceReference}, ${draft.provider}, ${draft.model}, ${draft.promptVersion},
        ${draft.createdBy}, NOW(), ${reviewedBy}
      WHERE NOT EXISTS (SELECT 1 FROM second_existing)
      ON CONFLICT (normalized_surface, (COALESCE(reading, ''))) DO UPDATE SET updated_at = NOW()
      RETURNING id
    ), second_word AS (
      SELECT id FROM second_existing UNION ALL SELECT id FROM second_inserted LIMIT 1
    ), pair AS (
      INSERT INTO word_pairs (word_a_id, word_b_id, relation, category, difficulty, pair_distance,
        requested_pair_distance, status, source_type, source_environment,
        source_reference, provider, model, prompt_version, created_by, reviewed_at, reviewed_by)
      SELECT LEAST(first_word.id, second_word.id), GREATEST(first_word.id, second_word.id),
        ${text(draft.payload.reason)}, ${text(draft.payload.difficulty, 80)}, ${text(draft.payload.pairDistance, 80)},
        ${text(draft.payload.pairDistance, 80)}, ${text(draft.payload.pairDistance, 80)}, 'active', ${draft.sourceType},
        ${draft.sourceEnvironment}, ${draft.sourceReference}, ${draft.provider}, ${draft.model}, ${draft.promptVersion},
        ${draft.createdBy}, NOW(), ${reviewedBy} FROM first_word, second_word
      ON CONFLICT (word_a_id, word_b_id) DO UPDATE SET
        relation = EXCLUDED.relation,
        category = EXCLUDED.category,
        difficulty = EXCLUDED.difficulty,
        pair_distance = EXCLUDED.pair_distance,
        requested_pair_distance = EXCLUDED.requested_pair_distance,
        status = 'active', reviewed_at = NOW(), reviewed_by = ${reviewedBy}, updated_at = NOW()
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
