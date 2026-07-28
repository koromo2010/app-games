import { pathToFileURL } from "node:url";
import { generalWordGenres } from "../lib/general-word-genres.ts";
import { closePostgresClient, getPostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("AI_WORD_STATUS_LOCAL_DATABASE_REQUIRED");
  }
}

async function showStatus() {
  assertLocalDatabase();
  await ensureWordMasterSchema();
  const sql = getPostgresClient();
  const rows = await sql.query(
    `
      SELECT category.category_key, category.display_name, category.target_count,
             COUNT(candidate.id) FILTER (WHERE candidate.review_status <> 'rejected')::INTEGER AS candidate_count,
             COUNT(candidate.id) FILTER (WHERE candidate.quality_status = 'approved')::INTEGER AS approved_count,
             (
               SELECT COUNT(*)::INTEGER
               FROM ai_word_staged_candidates staged
               WHERE staged.category_key = category.category_key
             ) AS staged_count
      FROM ai_word_categories category
      LEFT JOIN ai_word_candidates candidate ON candidate.category_key = category.category_key
      WHERE category.active
      GROUP BY category.category_key, category.display_name, category.target_count, category.sort_order
      ORDER BY category.sort_order
    `,
  );
  const knownKeys = new Set(rows.map((row) => row.category_key));
  const missingGenres = generalWordGenres.filter((genre) => !knownKeys.has(genre.key));
  console.table(rows.map((row) => ({
    category: row.display_name,
    staged: Number(row.staged_count),
    candidates: Number(row.candidate_count),
    target: Number(row.target_count),
    approved: Number(row.approved_count),
  })));
  const [summary] = await sql.query(
    `
      SELECT
        COUNT(*)::INTEGER AS generated,
        COUNT(*) FILTER (WHERE quality_status = 'approved')::INTEGER AS approved,
        COUNT(*) FILTER (WHERE quality_status = 'rejected')::INTEGER AS rejected,
        COUNT(*) FILTER (WHERE difficulty = 'easy')::INTEGER AS easy,
        COUNT(*) FILTER (WHERE difficulty = 'normal')::INTEGER AS normal,
        COUNT(*) FILTER (WHERE difficulty = 'hard')::INTEGER AS hard,
        COUNT(*) FILTER (WHERE quality_status = 'approved' AND difficulty IS NULL)::INTEGER AS unclassified,
        (SELECT COUNT(*)::INTEGER FROM ai_word_staged_candidates) AS staged
      FROM ai_word_candidates
    `,
  );
  console.table([{
    generated: Number(summary.generated),
    staged: Number(summary.staged),
    approved: Number(summary.approved),
    rejected: Number(summary.rejected),
    easy: Number(summary.easy),
    normal: Number(summary.normal),
    hard: Number(summary.hard),
    unclassified: Number(summary.unclassified),
  }]);
  if (process.argv.includes("--promoted-new")) {
    const promotedNew = await sql.query(
      `SELECT candidate.id, candidate.surface, candidate.reading,
              candidate.category_key, candidate.difficulty,
              candidate.promoted_word_id
       FROM ai_word_candidates candidate
       JOIN words word ON word.id = candidate.promoted_word_id
       JOIN word_sources source ON source.id = word.source_id
       WHERE candidate.review_status = 'promoted'
         AND source.source_key = 'ai-general-generated-v1'
       ORDER BY candidate.category_key, candidate.id`,
    );
    console.log(JSON.stringify(promotedNew, null, 2));
  }
  if (missingGenres.length > 0) {
    console.log(`未登録カテゴリ: ${missingGenres.map((genre) => genre.name).join("、")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  showStatus()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}
