import { pathToFileURL } from "node:url";
import { closePostgresClient, getPostgresClient, getPostgresConfig } from "../lib/postgres-store.ts";
import { ensureWordMasterSchema } from "../lib/word-master-schema.ts";

const policyVersion = "word-reading-correction-v1";
const corrections = [{
  surface: "同相写像",
  oldReading: "どうしょうしゃぞう",
  newReading: "どうそうしゃぞう",
  sourceKey: "jmdict",
  reason: "数学用語「同相」の標準的な読みへ訂正",
}] as const;

function assertLocalDatabase() {
  const config = getPostgresConfig();
  if (!config) throw new Error("DATABASE_URL is required");
  const hostname = new URL(config.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error("WORD_READING_CORRECTION_LOCAL_DATABASE_REQUIRED");
  }
}

async function applyCorrections() {
  assertLocalDatabase();
  await ensureWordMasterSchema();
  const sql = getPostgresClient();
  const results: Array<Record<string, unknown>> = [];

  for (const correction of corrections) {
    const rows = await sql.query(
      `SELECT word.id,
              word.surface,
              word.reading,
              word.primary_part_of_speech,
              word.proper_noun_status,
              word.person_name_status,
              source.source_key
       FROM words word
       JOIN word_sources source ON source.id = word.source_id
       WHERE word.normalized_form = $1
         AND source.source_key = $2
       ORDER BY word.id`,
      [correction.surface, correction.sourceKey],
    );
    const target = rows.find((row) => row.reading === correction.oldReading);
    if (!target) {
      const alreadyCorrected = rows.find((row) => row.reading === correction.newReading);
      if (!alreadyCorrected) {
        throw new Error(`WORD_READING_CORRECTION_TARGET_NOT_FOUND:${correction.surface}`);
      }
      results.push({
        surface: correction.surface,
        wordId: alreadyCorrected.id,
        reading: correction.newReading,
        alreadyApplied: true,
      });
      continue;
    }
    if (
      target.primary_part_of_speech !== "名詞"
      || target.proper_noun_status !== "common"
      || target.person_name_status !== "not_person"
    ) {
      throw new Error(`WORD_READING_CORRECTION_TARGET_CLASSIFICATION_MISMATCH:${correction.surface}`);
    }
    await sql.query(
      `UPDATE words
       SET reading = $2,
           updated_at = NOW()
       WHERE id = $1
         AND reading = $3`,
      [target.id, correction.newReading, correction.oldReading],
    );
    await sql.query(
      `INSERT INTO word_reading_corrections (
         word_id, surface, old_reading, new_reading,
         reason, policy_version, corrected_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'user-confirmed')
       ON CONFLICT (word_id, policy_version) DO NOTHING`,
      [
        target.id,
        correction.surface,
        correction.oldReading,
        correction.newReading,
        correction.reason,
        policyVersion,
      ],
    );
    results.push({
      surface: correction.surface,
      wordId: target.id,
      oldReading: correction.oldReading,
      newReading: correction.newReading,
      corrected: true,
    });
  }

  console.log(JSON.stringify({
    policyVersion,
    results,
    separateLexemes: [{
      surface: "直示",
      existingReading: "ナオジ",
      existingType: "given_name_only",
      newReading: "ちょくじ",
      action: "keep_existing_name_and_add_common_noun",
    }],
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  applyCorrections()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(closePostgresClient);
}
