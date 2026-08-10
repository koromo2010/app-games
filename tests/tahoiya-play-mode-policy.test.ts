import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TAHOIYA_DEFAULT_PLAY_MODE,
  TAHOIYA_PLAY_MODE_SELECTION_VISIBLE,
} from "../lib/tahoiya-types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("new Tahoiya rooms default to all-vote while the legacy mode selector stays hidden", () => {
  assert.equal(TAHOIYA_DEFAULT_PLAY_MODE, "all-vote");
  assert.equal(TAHOIYA_PLAY_MODE_SELECTION_VISIBLE, false);

  const adapter = read("app/tahoiya/tahoiya-room-adapter.ts");
  const storedDefaults = read("lib/room-defaults-store.ts");
  const roomPanel = read("app/tahoiya/TahoiyaRoomPanel.tsx");

  assert.match(adapter, /const playMode = TAHOIYA_DEFAULT_PLAY_MODE/);
  assert.match(adapter, /playMode: TAHOIYA_DEFAULT_PLAY_MODE/);
  assert.match(storedDefaults, /const playMode = TAHOIYA_DEFAULT_PLAY_MODE/);
  assert.match(roomPanel, /TAHOIYA_PLAY_MODE_SELECTION_VISIBLE \? <Setting title="遊び方"/);
});

test("legacy single-answerer rooms remain readable but are absent from current guidance", () => {
  const roomNormalizer = read("lib/tahoiya-room-normalizer.ts");
  const rules = read("app/tahoiya/TahoiyaRulesDialog.tsx");
  const emptyState = read("app/tahoiya/TahoiyaScorePanel.tsx");

  assert.match(roomNormalizer, /parsed\.playMode === "all-vote" \? "all-vote" : "single-answerer"/);
  assert.doesNotMatch(rules, /回答者1人|2つの遊び方/);
  assert.doesNotMatch(emptyState, /回答者1人|2つの遊び方/);
});
