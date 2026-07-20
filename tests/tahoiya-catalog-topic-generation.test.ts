import assert from "node:assert/strict";
import test from "node:test";
import {
  describeTahoiyaCatalogTopicGenerationFailure,
  isTahoiyaDictionaryStyleDefinition,
  parseTahoiyaCatalogTopicGeneration,
  tahoiyaLlmConnectionErrorCode,
} from "../lib/tahoiya-catalog-topic-generation.ts";

test("LLM接続失敗を一般的な生成失敗と区別して利用者へ伝える", () => {
  assert.deepEqual(
    describeTahoiyaCatalogTopicGenerationFailure(new Error("GAME_LLM_UNAVAILABLE"), "standard"),
    {
      errorCode: tahoiyaLlmConnectionErrorCode,
      message: "LLMとの通信に失敗したため、お題の正解文を生成できませんでした。少し待ってもう一度お試しください。",
    },
  );
  assert.deepEqual(
    describeTahoiyaCatalogTopicGenerationFailure(new Error("VOCABULARY_STORE_NOT_CONFIGURED"), "extreme"),
    {
      errorCode: "TAHOIYA_TOPIC_GENERATION_FAILED",
      message: "魔境候補から正解文を生成できませんでした。もう一度お試しください。",
    },
  );
});

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
  assert.match(result.topic.sourceDetail, /0以上3未満の実質Zipf候補を一括審査/);
  assert.match(result.topic.sourceDetail, /推定認知率 1%超〜14%/);
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

test("敬体や文字数合わせの解説文は辞書語釈として保存しない", () => {
  const screenshotDefinition = "中東地域で人名として広く用いられ、神への奉仕や忠誠を意味し、歴史的文献にも登場します。";
  assert.equal(isTahoiyaDictionaryStyleDefinition(screenshotDefinition), false);
  assert.equal(isTahoiyaDictionaryStyleDefinition("水中で気体量を変え、魚の浮力を調節する袋状の器官。"), true);
  assert.deepEqual(
    parseTahoiyaCatalogTopicGeneration(
      JSON.stringify({ sensitive: false, reading: "あぶどらいえ", realDefinition: screenshotDefinition }),
      { word: "アブドライェ" },
      "extreme",
    ),
    { status: "invalid" },
  );
  assert.deepEqual(
    parseTahoiyaCatalogTopicGeneration(
      JSON.stringify({ sensitive: false, reading: "みずがめ", realDefinition: "水を蓄えるために使われます。" }),
      { word: "水瓶" },
      "standard",
    ),
    { status: "invalid" },
  );
});

test("選ばれた長さ帯の上限を超えた正解文は保存しない", () => {
  assert.deepEqual(
    parseTahoiyaCatalogTopicGeneration(
      JSON.stringify({ sensitive: false, reading: "はこ", realDefinition: "道具を収納するための小さな木製の容器。" }),
      { word: "函" },
      "standard",
      14,
    ),
    { status: "invalid" },
  );
});
