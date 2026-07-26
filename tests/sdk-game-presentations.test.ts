import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveApprovedSdkGamePresentation,
} from "../config/sdk-game-presentations.ts";

test("approved SDK game presentation can evolve without rewriting its package", () => {
  const presentation = resolveApprovedSdkGamePresentation({
    gameId: "ai-word-guess",
    fallbackTitle: {
      ja: "AIことば当て",
      en: "AI Word Guess",
    },
  });

  assert.deepEqual(presentation.title, {
    ja: "コトバに迫れ",
    en: "Close in on the Word",
  });
  assert.equal(
    presentation.visual,
    "/game-visuals/kotoba-ni-semare.webp",
  );
});

test("unconfigured approved SDK games keep manifest titles and placeholder art", () => {
  const fallbackTitle = {
    ja: "新しいゲーム",
    en: "New Game",
  };
  const presentation = resolveApprovedSdkGamePresentation({
    gameId: "new-sdk-game",
    fallbackTitle,
  });

  assert.deepEqual(presentation.title, fallbackTitle);
  assert.equal(
    presentation.visual,
    "/game-visuals/sdk-game-placeholder.svg",
  );
});
