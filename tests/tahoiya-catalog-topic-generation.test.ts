import assert from "node:assert/strict";
import test from "node:test";
import { parseTahoiyaCatalogTopicGeneration } from "../lib/tahoiya-catalog-topic-generation.ts";

test("DBの見出し語と読みを維持して正解文だけを採用する", () => {
  const result = parseTahoiyaCatalogTopicGeneration(
    JSON.stringify({
      sensitive: false,
      reading: "別の読み",
      realDefinition: "道具を収納するための小さな木箱。余分な二文目。",
    }),
    { word: "函笥", reading: "かんし" },
    "standard",
  );

  assert.equal(result.status, "accepted");
  if (result.status !== "accepted") return;
  assert.equal(result.topic.word, "函笥");
  assert.equal(result.topic.reading, "かんし");
  assert.equal(result.topic.realDefinition, "道具を収納するための小さな木箱。余分な二文目。".split("。")[0] + "。");
  assert.match(result.topic.note, /共通単語DB/);
  assert.match(result.topic.sourceDetail, /0 < 実質Zipf < 3/);
});

test("センシティブ判定された候補は採用しない", () => {
  const result = parseTahoiyaCatalogTopicGeneration(
    JSON.stringify({ sensitive: true, reading: "", realDefinition: "" }),
    { word: "候補語" },
    "extreme",
  );
  assert.deepEqual(result, { status: "unsafe" });
});

test("センシティブ判定や必要な生成内容が欠けた応答は採用しない", () => {
  assert.deepEqual(
    parseTahoiyaCatalogTopicGeneration(
      JSON.stringify({ reading: "こうほご", realDefinition: "十分な長さの説明です。" }),
      { word: "候補語" },
      "standard",
    ),
    { status: "invalid" },
  );
  assert.deepEqual(
    parseTahoiyaCatalogTopicGeneration(
      JSON.stringify({ sensitive: false, reading: "", realDefinition: "短い。" }),
      { word: "候補語" },
      "standard",
    ),
    { status: "invalid" },
  );
});
