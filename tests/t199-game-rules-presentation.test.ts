import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GAME_RULE_SECTION_KEYS,
  bindGameRules,
  getBuiltInGameRules,
  getSdkGameRules,
} from "../lib/game-rules.ts";

const source = (path: string) => readFileSync(path, "utf8");
const builtInIds = [
  "wordwolf", "tahoiya", "northern-branch", "hodoai", "kotoba-senpuku",
  "nigoichi", "code-intercept", "canvas", "daifugo",
] as const;

const completeSections = {
  summary: { ja: "概要", en: "Summary" },
  playerActions: { ja: "行動", en: "Actions" },
  winCondition: { ja: "勝利", en: "Win" },
  detailedRules: { ja: "詳細", en: "Details" },
  playExample: { ja: "例", en: "Example" },
} as const;

test("every built-in game has one complete revision-bound rules projection", () => {
  for (const gameId of builtInIds) {
    const rules = getBuiltInGameRules(gameId);
    assert.ok(rules, `${gameId} must have rules`);
    assert.equal(rules.gameId, gameId);
    assert.match(rules.revision, new RegExp(`^builtin:${gameId}:rules-v1$`));
    for (const section of GAME_RULE_SECTION_KEYS) {
      assert.ok(rules.sections[section].trim(), `${gameId}.${section} must be nonempty`);
    }
  }
});

test("rule binding rejects a different Room/package revision", () => {
  const rules = getBuiltInGameRules("wordwolf");
  assert.ok(rules);
  assert.equal(bindGameRules(rules, rules.revision), rules);
  assert.equal(bindGameRules(rules, "builtin:wordwolf:rules-v2"), null);
});

test("SDK rule projection is complete, localized, and fail-closed", () => {
  const ja = getSdkGameRules({
    gameId: "fixture-sdk",
    revision: "a".repeat(40),
    locale: "ja",
    ruleSections: completeSections,
  });
  assert.equal(ja?.sections.summary, "概要");
  assert.equal(ja?.revision, "a".repeat(40));
  assert.equal(getSdkGameRules({
    gameId: "fixture-sdk",
    revision: "a".repeat(40),
    locale: "ja",
    ruleSections: { ...completeSections, playExample: { ja: "", en: "Example" } },
  }), null);
  assert.equal(getSdkGameRules({
    gameId: "fixture-sdk",
    revision: null,
    locale: "ja",
    ruleSections: completeSections,
  }), null);
});

test("all four surfaces use the common non-blocking presentation contract", () => {
  const dialog = source("app/components/GameRulesDialog.tsx");
  const presentation = source("app/components/GameRulePresentation.tsx");
  const catalog = source("app/games/LobbyGameGrid.tsx");
  const frame = source("app/components/game-sdk/GameSdkFrameView.tsx");
  assert.match(dialog, /GameRuleSections/);
  assert.match(dialog, /useKeyboardLayer/);
  assert.match(catalog, /data-game-rule-revision/);
  assert.match(frame, /surface="creation"/);
  assert.match(frame, /surface="lobby"/);
  assert.match(frame, /bindGameRules\(ruleSet, room\.packageRevision/);
  assert.match(presentation, /aria-expanded/);
  assert.match(presentation, /localStorage/);
  assert.match(presentation, /このRoom revisionのルールを確認できません/);
  assert.doesNotMatch(presentation, /acknowledge|confirmedBy|humanConfirmed/i);
});
