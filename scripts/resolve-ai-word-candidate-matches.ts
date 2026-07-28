import { pathToFileURL } from "node:url";
import {
  closePostgresClient,
  getPostgresClient,
  getPostgresConfig,
} from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

const policyVersion = "ai-word-match-resolution-v1";
const katakana = Array.from(
  { length: "ヶ".charCodeAt(0) - "ァ".charCodeAt(0) + 1 },
  (_, index) => String.fromCharCode("ァ".charCodeAt(0) + index),
).join("");
const hiragana = Array.from(
  katakana,
  (character) => String.fromCharCode(character.charCodeAt(0) - 0x60),
).join("");

function readBatchPrefix() {
  return process.argv.find((argument) => argument.startsWith("--prefix="))?.slice("--prefix=".length)
    || "general-hard-v1-";
}

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_MATCH_RESOLUTION_LOCAL_DATABASE_REQUIRED");
  }
}

async function resolveCandidateMatches() {
  assertLocalDatabase();
  await ensureWordMasterSchema();
  const sql = getPostgresClient();
  const prefix = readBatchPrefix();

  const conflicts = await sql.query(
    `SELECT candidate.surface, resolution.policy_version
     FROM ai_word_candidate_match_resolutions resolution
     JOIN ai_word_candidates candidate ON candidate.id = resolution.candidate_id
     JOIN ai_word_generation_batches batch ON batch.id = candidate.generation_batch_id
     WHERE batch.batch_key LIKE $1 || '%'
       AND resolution.policy_version <> $2
     ORDER BY candidate.id`,
    [prefix, policyVersion],
  );
  if (conflicts.length > 0) {
    throw new Error(
      `AI_WORD_MATCH_RESOLUTION_POLICY_CONFLICT:${JSON.stringify(conflicts)}`,
    );
  }

  await sql.query(
    `WITH target AS (
       SELECT candidate.*
       FROM ai_word_candidates candidate
       JOIN ai_word_generation_batches batch ON batch.id = candidate.generation_batch_id
       WHERE batch.batch_key LIKE $1 || '%'
         AND candidate.quality_status = 'approved'
         AND candidate.content_safety_status = 'clean'
         AND candidate.difficulty IS NOT NULL
         AND candidate.review_status <> 'promoted'
     ),
     exact_matches AS (
       SELECT target.id AS candidate_id,
              ARRAY_AGG(word.id ORDER BY word.id) AS word_ids
       FROM target
       JOIN words word
         ON word.normalized_form = target.normalized_form
        AND translate(word.reading, $2, $3) = target.reading
        AND word.content_safety_status NOT IN ('review', 'exclude')
        AND NOT word.is_name_fragment
        AND NOT (
          word.proper_noun_status = 'proper'
          AND word.proper_noun_type = 'person'
        )
       GROUP BY target.id
     ),
     resolved AS (
       SELECT target.id AS candidate_id,
              COALESCE(cardinality(exact_matches.word_ids), 0) AS exact_match_count,
              CASE
                WHEN cardinality(exact_matches.word_ids) = 1
                  THEN exact_matches.word_ids[1]
                ELSE NULL
              END AS word_id,
              CASE
                WHEN cardinality(exact_matches.word_ids) = 1 THEN 'existing_word'
                WHEN COALESCE(cardinality(exact_matches.word_ids), 0) = 0 THEN 'new_lexeme'
                ELSE 'ambiguous_new_lexeme'
              END AS resolution_kind
       FROM target
       LEFT JOIN exact_matches ON exact_matches.candidate_id = target.id
     )
     INSERT INTO ai_word_candidate_match_resolutions (
       candidate_id, word_id, resolution_kind, exact_match_count,
       policy_version, resolved_by, reason
     )
     SELECT candidate_id,
            word_id,
            resolution_kind,
            exact_match_count,
            $4,
            'codex',
            CASE resolution_kind
              WHEN 'existing_word'
                THEN '表記と読みが一致する利用可能な既存words行が一意'
              WHEN 'new_lexeme'
                THEN '表記と読みが一致する利用可能な既存words行がない'
              ELSE '同じ表記と読みで複数の語彙行があり、意味を安全に特定できないため別語として追加'
            END
     FROM resolved
     ON CONFLICT (candidate_id) DO NOTHING`,
    [prefix, katakana, hiragana, policyVersion],
  );

  await sql.query(
    `UPDATE ai_word_candidates candidate
     SET matched_word_id = resolution.word_id,
         updated_at = NOW()
     FROM ai_word_candidate_match_resolutions resolution,
          ai_word_generation_batches batch
     WHERE resolution.candidate_id = candidate.id
       AND batch.id = candidate.generation_batch_id
       AND batch.batch_key LIKE $1 || '%'
       AND resolution.policy_version = $2
       AND candidate.review_status <> 'promoted'`,
    [prefix, policyVersion],
  );

  const [summary] = await sql.query(
    `SELECT
       COUNT(*)::INTEGER AS candidates,
       COUNT(*) FILTER (
         WHERE resolution.resolution_kind = 'existing_word'
       )::INTEGER AS existing_word,
       COUNT(*) FILTER (
         WHERE resolution.resolution_kind = 'new_lexeme'
       )::INTEGER AS new_lexeme,
       COUNT(*) FILTER (
         WHERE resolution.resolution_kind = 'ambiguous_new_lexeme'
       )::INTEGER AS ambiguous_new_lexeme,
       COUNT(*) FILTER (
         WHERE resolution.resolution_kind = 'existing_word'
           AND candidate.matched_word_id = resolution.word_id
       )::INTEGER AS matched_ids_assigned,
       COUNT(*) FILTER (WHERE resolution.id IS NULL)::INTEGER AS unresolved
     FROM ai_word_candidates candidate
     JOIN ai_word_generation_batches batch ON batch.id = candidate.generation_batch_id
     LEFT JOIN ai_word_candidate_match_resolutions resolution
       ON resolution.candidate_id = candidate.id
      AND resolution.policy_version = $2
     WHERE batch.batch_key LIKE $1 || '%'
       AND candidate.quality_status = 'approved'
       AND candidate.content_safety_status = 'clean'
       AND candidate.difficulty IS NOT NULL`,
    [prefix, policyVersion],
  );
  const ambiguous = await sql.query(
    `SELECT candidate.surface, candidate.reading,
            resolution.exact_match_count, resolution.reason
     FROM ai_word_candidate_match_resolutions resolution
     JOIN ai_word_candidates candidate ON candidate.id = resolution.candidate_id
     JOIN ai_word_generation_batches batch ON batch.id = candidate.generation_batch_id
     WHERE batch.batch_key LIKE $1 || '%'
       AND resolution.policy_version = $2
       AND resolution.resolution_kind = 'ambiguous_new_lexeme'
     ORDER BY candidate.id`,
    [prefix, policyVersion],
  );
  if (Number(summary.unresolved) !== 0) {
    throw new Error(`AI_WORD_MATCH_RESOLUTION_INCOMPLETE:${JSON.stringify(summary)}`);
  }

  console.log(JSON.stringify({
    batchPrefix: prefix,
    policyVersion,
    summary,
    ambiguous,
    permanentWordIdsCreated: false,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  resolveCandidateMatches()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}
