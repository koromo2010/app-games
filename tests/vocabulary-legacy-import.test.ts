import assert from "node:assert/strict";
import test from "node:test";
import {
  isLegacyVocabularyImportComplete,
  normalizeLegacyCatalogRows,
  resolveLegacyVocabularySourceUrl,
} from "../lib/vocabulary-legacy-import.ts";

test("legacy vocabulary import prefers its temporary read-only source", () => {
  assert.equal(resolveLegacyVocabularySourceUrl({
    LEGACY_WORD_DATABASE_URL: " postgres://legacy ",
    APP_DATABASE_URL: "postgres://development",
  }), "postgres://legacy");
  assert.equal(resolveLegacyVocabularySourceUrl({ APP_DATABASE_URL: " postgres://development " }), "postgres://development");
  assert.equal(resolveLegacyVocabularySourceUrl({}), null);
});

test("legacy vocabulary rows are normalized and duplicate readings collapse", () => {
  const rows = normalizeLegacyCatalogRows([
    { word_master_id: "10", surface: " テスト ", reading: "てすと", zipf_frequency: "4.5" },
    { word_master_id: 11, surface: "テスト", reading: "てすと", zipf_frequency: 5 },
    { word_master_id: 12, surface: "ＡＢＣ", reading: null, zipf_frequency: 3 },
  ]);
  assert.deepEqual(rows, [
    { wordMasterId: 11, surface: "テスト", reading: "てすと", normalizedSurface: "テスト", zipf: 5, characterCount: 3 },
    { wordMasterId: 12, surface: "ABC", reading: "", normalizedSurface: "abc", zipf: 3, characterCount: 3 },
  ]);
});

test("legacy vocabulary normalization rejects invalid ids, words, and Zipf values", () => {
  const rows = normalizeLegacyCatalogRows([
    { word_master_id: 0, surface: "無効ID", reading: null, zipf_frequency: 4 },
    { word_master_id: 1, surface: " ", reading: null, zipf_frequency: 4 },
    { word_master_id: 2, surface: "範囲外", reading: null, zipf_frequency: 11 },
    { word_master_id: 3, surface: "正常", reading: null, zipf_frequency: 0 },
  ]);
  assert.deepEqual(rows, [
    { wordMasterId: 3, surface: "正常", reading: "", normalizedSurface: "正常", zipf: 0, characterCount: 2 },
  ]);
});

test("legacy vocabulary completion compares normalized imports instead of source rows", () => {
  assert.equal(isLegacyVocabularyImportComplete(194_882, 194_881), false);
  assert.equal(isLegacyVocabularyImportComplete(194_882, 194_882), true);
  assert.equal(isLegacyVocabularyImportComplete(0, 0), false);
});
