import test from "node:test";
import assert from "node:assert/strict";
import {
  isTahoiyaDecoyPureZero,
  parseTahoiyaReplayForSalvage,
  tahoiyaDecoyEventsFromReplay,
  tahoiyaDecoyTotalVotes,
  tahoiyaSoloActiveCandidateLimit,
  tahoiyaSoloDecoyCount,
} from "../lib/tahoiya-decoy-candidate-core.ts";

function replay(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    id: "replay_test",
    gameType: "tahoiya",
    finishedAt: 1_700_000_000_000,
    word: "難語",
    reading: "なんご",
    realDefinition: "理解しにくい難しい言葉。",
    definitions: [
      { id: "real", text: "理解しにくい難しい言葉。", authorId: null, isReal: true },
      { id: "fake-a", text: "古い船で使われた結び目。", authorId: "player-a", isReal: false },
      { id: "fake-b", text: "山間部に生える多年草。", authorId: "player-b", isReal: false },
    ],
    votes: {
      "player-a": "fake-b",
      "player-b": "real",
      "player-c": "fake-b",
    },
    ...overrides,
  });
}

test("一人たほい屋は現役9候補から偽回答3件を使う", () => {
  assert.equal(tahoiyaSoloActiveCandidateLimit, 9);
  assert.equal(tahoiyaSoloDecoyCount, 3);
});

test("過去プレイバックから正解と個人情報を除いた候補イベントを作る", () => {
  const parsed = parseTahoiyaReplayForSalvage(replay());
  assert.ok(parsed);
  const events = tahoiyaDecoyEventsFromReplay(parsed);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => ({
    text: event.definitionText,
    votes: event.votes,
    opportunities: event.voterOpportunities,
    sourceKind: event.sourceKind,
  })), [
    { text: "古い船で使われた結び目。", votes: 0, opportunities: 2, sourceKind: "legacy_replay" },
    { text: "山間部に生える多年草。", votes: 2, opportunities: 2, sourceKind: "legacy_replay" },
  ]);
  assert.equal(JSON.stringify(events).includes("player-a"), false);
  assert.equal(JSON.stringify(events).includes("player-b"), false);
});

test("サルベージは同じプレイバックから安定した候補IDとイベントIDを作る", () => {
  const parsed = parseTahoiyaReplayForSalvage(replay());
  assert.ok(parsed);
  assert.deepEqual(tahoiyaDecoyEventsFromReplay(parsed), tahoiyaDecoyEventsFromReplay(parsed));
});

test("ダミー参加者を含むデバッグラウンドは回答ごと回収しない", () => {
  const parsed = parseTahoiyaReplayForSalvage(replay({
    definitions: [
      { id: "real", text: "理解しにくい難しい言葉。", authorId: null, isReal: true },
      { id: "dummy", text: "別の説明。", authorId: "dummy-1", isReal: false },
      { id: "template", text: "特定の作業に使われる古い道具の一種。", authorId: "player-a", isReal: false },
    ],
    votes: { "player-b": "dummy" },
  }));
  assert.ok(parsed);
  assert.deepEqual(tahoiyaDecoyEventsFromReplay(parsed), []);
});

test("有効な投票機会があり合計0票なら純粋な0票候補になる", () => {
  assert.equal(isTahoiyaDecoyPureZero({
    multiplayerVotes: 0,
    soloVotes: 0,
    multiplayerVoteOpportunities: 2,
    soloAppearances: 0,
  }), true);
  assert.equal(isTahoiyaDecoyPureZero({
    multiplayerVotes: 0,
    soloVotes: 0,
    multiplayerVoteOpportunities: 0,
    soloAppearances: 0,
  }), false);
  assert.equal(isTahoiyaDecoyPureZero({
    multiplayerVotes: 0,
    soloVotes: 1,
    multiplayerVoteOpportunities: 2,
    soloAppearances: 1,
  }), false);
  assert.equal(tahoiyaDecoyTotalVotes({ multiplayerVotes: 2, soloVotes: 3 }), 5);
});

test("壊れたデータや他ゲームのプレイバックは読み込まない", () => {
  assert.equal(parseTahoiyaReplayForSalvage("not-json"), null);
  assert.equal(parseTahoiyaReplayForSalvage(replay({ gameType: "wordwolf" })), null);
  assert.equal(parseTahoiyaReplayForSalvage(replay({ votes: null })), null);
});
