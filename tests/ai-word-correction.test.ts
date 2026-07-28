import assert from "node:assert/strict";
import test from "node:test";
import { parseAiWordCorrectionInput } from "../lib/ai-word-correction.ts";

test("word corrections allow a single unambiguous kanji surface", () => {
  const correction = parseAiWordCorrectionInput({
    schemaVersion: 1,
    correctionKey: "general-user-correction-v1-001",
    correctedBy: "user",
    policyVersion: "general-word-user-correction-v1",
    items: [
      { surface: "もも", action: "replace_surface", newSurface: "桃", reason: "漢字で意味を固定する" },
      { surface: "最中", action: "exclude", reason: "読みが曖昧なため除外する" },
      { surface: "ラムネ", action: "approve", reason: "多少の多義性を許容する" },
    ],
  });

  assert.equal(correction.items[0]?.action, "replace_surface");
  assert.equal(correction.items[0]?.newSurface, "桃");
  assert.equal(correction.items[1]?.action, "exclude");
  assert.equal(correction.items[2]?.action, "approve");
});

test("word corrections reject non-Japanese replacement surfaces", () => {
  assert.throws(() => parseAiWordCorrectionInput({
    schemaVersion: 1,
    correctionKey: "general-user-correction-v1-invalid",
    correctedBy: "user",
    policyVersion: "general-word-user-correction-v1",
    items: [
      { surface: "もも", action: "replace_surface", newSurface: "peach", reason: "invalid" },
    ],
  }), /AI_WORD_CORRECTION_NEW_SURFACE_INVALID/);
});
