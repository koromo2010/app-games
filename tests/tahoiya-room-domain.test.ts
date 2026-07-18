import assert from "node:assert/strict";
import test from "node:test";
import {
  canAdvanceTahoiyaPhase,
  canPolishTahoiyaDefinition,
  createDefinitionOptions,
  scoreRoom,
  tahoiyaPhaseTimeLimitSeconds,
  tahoiyaTimeoutSubmission,
} from "../lib/tahoiya-room-domain.ts";
import { normalizeTahoiyaOptionId } from "../lib/tahoiya-option-id.ts";
import { sanitizeTahoiyaRoom } from "../lib/tahoiya-room-presentation.ts";
import type { TahoiyaRoom } from "../lib/tahoiya-types.ts";

function room(overrides: Partial<TahoiyaRoom> = {}): TahoiyaRoom {
  return {
    code: "TEST",
    revision: 0,
    hostId: "host",
    passphrase: "",
    phase: "writing",
    players: [
      { id: "host", name: "Host", joinedAt: 1 },
      { id: "writer", name: "Writer", joinedAt: 2 },
    ],
    parentId: "host",
    playMode: "single-answerer",
    topicDifficulty: "standard",
    answererMode: "manual",
    showRealDefinitionToWriters: false,
    actionTimeLimitSeconds: 120,
    correctVotePoints: 1,
    fooledVotePoints: 1,
    phaseStartedAt: Date.now(),
    answererId: "host",
    round: 1,
    word: "試験語",
    reading: "しけんご",
    realDefinition: "本物の説明。",
    topicNote: "",
    topicSourceDetail: "",
    topicSource: "llm",
    fakeDefinitions: {},
    options: [
      { id: "real", text: "本物の説明。", authorId: null, isReal: true },
      { id: "fake", text: "偽の説明。", authorId: "writer", isReal: false },
    ],
    votes: {},
    scores: {},
    resultText: "",
    playerTimeouts: {
      host: { consecutiveTimeouts: 0, reducedTime: false },
      writer: { consecutiveTimeouts: 2, reducedTime: true },
    },
    playerTimeoutNotice: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test("偽説明整形は担当者だけが使え、回答者には許可しない", () => {
  const current = room();
  assert.equal(canPolishTahoiyaDefinition(current, "writer"), true);
  assert.equal(canPolishTahoiyaDefinition(current, "host"), false);
  assert.equal(canPolishTahoiyaDefinition({ ...current, debugMode: true }, "host"), true);
  assert.equal(canPolishTahoiyaDefinition({ ...current, phase: "voting" }, "writer"), false);
});

test("通常ホストは未完了の入力を強制確定できず、デバッグ時だけ進められる", () => {
  const writing = room();
  assert.equal(canAdvanceTahoiyaPhase(writing, "voting", true), false);
  assert.equal(canAdvanceTahoiyaPhase({ ...writing, debugMode: true }, "voting", true), true);

  const voting = room({ phase: "voting" });
  assert.equal(canAdvanceTahoiyaPhase(voting, "result", true), false);
  assert.equal(canAdvanceTahoiyaPhase({ ...voting, debugMode: true }, "result", true), true);
  assert.equal(canAdvanceTahoiyaPhase({ ...voting, votes: { host: "real" } }, "result"), true);
});

test("短縮対象の操作プレイヤーにはサーバーと同じ残り5秒を表示する", () => {
  const writing = room();
  assert.equal(tahoiyaPhaseTimeLimitSeconds(writing, "writer"), 5);
  assert.equal(tahoiyaPhaseTimeLimitSeconds(writing, "host"), 120);

  const voting = room({
    phase: "voting",
    playMode: "all-vote",
    answererId: "",
  });
  assert.equal(tahoiyaPhaseTimeLimitSeconds(voting, "writer"), 5);
  assert.equal(tahoiyaPhaseTimeLimitSeconds({ ...voting, votes: { writer: "real" } }, "writer"), 120);
});

test("回答者には執筆中のお題と読みを返さず、投票開始後に公開する", () => {
  const writing = room();
  const answererView = sanitizeTahoiyaRoom(writing, "host");
  assert.equal(answererView.word, "");
  assert.equal(answererView.reading, undefined);
  assert.equal(answererView.realDefinition, "");

  const writerView = sanitizeTahoiyaRoom(writing, "writer");
  assert.equal(writerView.word, "試験語");
  assert.equal(writerView.reading, "しけんご");

  const votingView = sanitizeTahoiyaRoom({ ...writing, phase: "voting" }, "host");
  assert.equal(votingView.word, "試験語");
  assert.equal(votingView.reading, "しけんご");
});

test("時間切れ用の内部値をプレイヤー向けレスポンスへ返さない", () => {
  const current = room({
    fakeDefinitions: { writer: tahoiyaTimeoutSubmission },
    votes: { host: tahoiyaTimeoutSubmission },
  });
  const playerView = sanitizeTahoiyaRoom(current, "writer");
  const resultView = sanitizeTahoiyaRoom({ ...current, phase: "result" }, "writer");
  assert.deepEqual(playerView.fakeDefinitions, {});
  assert.deepEqual(playerView.votes, {});
  assert.deepEqual(resultView.fakeDefinitions, {});
  assert.deepEqual(resultView.votes, {});
});

test("時間切れ票を最多得票・得点・結果公開の票から除外する", () => {
  const current = room({
    phase: "voting",
    players: [
      { id: "host", name: "Host", joinedAt: 1 },
      { id: "writer", name: "Writer", joinedAt: 2 },
      { id: "slow-1", name: "Slow 1", joinedAt: 3 },
      { id: "slow-2", name: "Slow 2", joinedAt: 4 },
    ],
    playMode: "all-vote",
    answererId: "",
    votes: {
      host: "real",
      "slow-1": tahoiyaTimeoutSubmission,
      "slow-2": tahoiyaTimeoutSubmission,
    },
  });
  const scored = scoreRoom(current);
  assert.deepEqual(scored.votes, { host: "real" });
  assert.match(scored.resultText, /最多得票: 本物の説明（1票）/);
  assert.doesNotMatch(scored.resultText, /投票はありませんでした/);
  assert.equal(scored.scores.host, 1);
});

test("投票選択肢IDから本物と偽物を判別できない", () => {
  const options = createDefinitionOptions(room({ fakeDefinitions: { writer: "偽の説明。" } }));
  assert.equal(options.length, 2);
  assert.equal(options.every((option) => /^[0-9a-f-]{36}$/i.test(option.id)), true);
  assert.equal(options.some((option) => /^(?:real|fake)-/.test(option.id)), false);
});

test("進行中ルームの旧選択肢IDを不透明IDへ移行できる", () => {
  const realId = "11111111-1111-4111-8111-111111111111";
  const fakeId = "22222222-2222-4222-8222-222222222222";
  assert.equal(normalizeTahoiyaOptionId(`real-${realId}`), realId);
  assert.equal(normalizeTahoiyaOptionId(`fake-${fakeId}`), fakeId);
  assert.equal(normalizeTahoiyaOptionId("__timeout__"), "__timeout__");
});
