import type { NigoichiWordDifficulty } from "./nigoichi.ts";
import {
  defaultWordSelectionHyperparameters,
} from "./word-selection-protocol.ts";
import {
  getVocabularyPostgresClient,
  isVocabularyPostgresConfigured,
} from "./vocabulary-postgres-store.ts";

type NigoichiWordRow = {
  surface: string;
};

export async function loadNigoichiWordPool(
  difficulty: NigoichiWordDifficulty,
  requestedLimit: number,
) {
  if (!isVocabularyPostgresConfigured()) return [];
  const limit = Math.max(1, Math.min(100, Math.floor(requestedLimit)));
  const { targetZipf, width } = defaultWordSelectionHyperparameters.difficulties[difficulty];
  const rows = await getVocabularyPostgresClient()`
    WITH eligible_words AS (
      SELECT DISTINCT ON (word.normalized_surface)
        word.surface,
        word.normalized_surface,
        word.effective_zipf
      FROM active_words word
      JOIN active_word_game_eligibility eligibility
        ON eligibility.subject_type = 'word'
        AND eligibility.subject_id = word.id
        AND eligibility.game_id = 'wordwolf'
      WHERE word.effective_zipf >= 3
        AND word.effective_zipf BETWEEN ${targetZipf - 1.5} AND ${targetZipf + 1.5}
        AND NOT word.proper_noun
        AND (eligibility.valid_from IS NULL OR eligibility.valid_from <= NOW())
        AND (eligibility.valid_until IS NULL OR eligibility.valid_until > NOW())
      ORDER BY word.normalized_surface, word.updated_at DESC, word.id
    )
    SELECT surface
    FROM eligible_words
    ORDER BY
      (-LN(GREATEST(RANDOM(), 0.000001))) /
      EXP(-0.5 * POWER((effective_zipf - ${targetZipf}) / ${width}, 2)),
      normalized_surface
    LIMIT ${limit}
  ` as NigoichiWordRow[];
  return rows.map((row) => row.surface.trim()).filter(Boolean);
}
