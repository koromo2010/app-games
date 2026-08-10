import assert from "node:assert/strict";
import test from "node:test";
import {
  gameLandingContent,
  sharedGameFieldsFaq,
} from "../app/games/game-landing-content.ts";

test("Tahoiya landing copy is game-specific in both locales", () => {
  for (const locale of ["ja", "en"] as const) {
    const content = gameLandingContent("tahoiya", locale);
    assert.ok(content);
    assert.equal(content.features.length, 3);
    assert.equal(content.steps.length, 3);
    assert.equal(content.faqItems.length, 3);
    assert.ok(content.overview.length >= 2);
  }

  assert.match(gameLandingContent("tahoiya", "ja")?.eyebrow ?? "", /辞書いらず/);
  assert.match(gameLandingContent("tahoiya", "ja")?.faqItems[0]?.[0] ?? "", /辞書や出題役/);
  assert.doesNotMatch(JSON.stringify(gameLandingContent("tahoiya", "ja")), /回答者1人|2つの遊び方/);
  assert.doesNotMatch(JSON.stringify(gameLandingContent("tahoiya", "en")), /one answerer|Two ways to play/i);
});

test("shared Game Fields FAQ remains separate from game-specific FAQ", () => {
  for (const locale of ["ja", "en"] as const) {
    assert.equal(sharedGameFieldsFaq[locale].length, 3);
    assert.equal(
      sharedGameFieldsFaq[locale].some(([question]) => (
        gameLandingContent("tahoiya", locale)?.faqItems.some(([candidate]) => candidate === question)
      )),
      false,
    );
  }

  assert.match(sharedGameFieldsFaq.ja[0]?.[0] ?? "", /無料/);
  assert.equal(gameLandingContent("wordwolf", "ja"), null);
});
