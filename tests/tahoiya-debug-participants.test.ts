import assert from "node:assert/strict";
import test from "node:test";
import {
  nextTahoiyaDebugPlayerName,
  removeTahoiyaDebugParticipants,
} from "../lib/tahoiya-debug-participants.ts";
import type { TahoiyaPlayer, TahoiyaRoom } from "../lib/tahoiya-types.ts";

const host: TahoiyaPlayer = { id: "host", name: "Host", joinedAt: 1 };
const dummyTwo: TahoiyaPlayer = { id: "dummy-two", name: "テスト2", joinedAt: 2 };
const dummyThree: TahoiyaPlayer = { id: "dummy-three", name: "テスト3", joinedAt: 3 };

function makeRoom(): TahoiyaRoom {
  return {
    playerTimeouts: {
      host: { consecutiveTimeouts: 0, reducedTime: false },
      "dummy-two": { consecutiveTimeouts: 2, reducedTime: true },
      "dummy-three": { consecutiveTimeouts: 0, reducedTime: false },
    },
    playerTimeoutNotice: {
      id: "dummy-two:reduced:1",
      playerId: "dummy-two",
      kind: "reduced",
      message: "timeout",
      createdAt: 1,
    },
    code: "TEST",
    revision: 1,
    hostId: host.id,
    passphrase: "",
    phase: "lobby",
    debugMode: true,
    lobbyReturn: {
      reason: "debug-abort",
      round: 1,
      startedAt: 1,
      returnedPlayerIds: [host.id, dummyTwo.id, dummyThree.id],
    },
    players: [host, dummyTwo, dummyThree],
    parentId: host.id,
    playMode: "single-answerer",
    topicDifficulty: "standard",
    answererMode: "manual",
    showRealDefinitionToWriters: true,
    fakeDefinitionsPerPlayer: 1,
    actionTimeLimitSeconds: 0,
    correctVotePoints: 1,
    fooledVotePoints: 1,
    phaseStartedAt: null,
    answererId: dummyTwo.id,
    round: 1,
    gameStartedAt: null,
    word: "",
    realDefinition: "",
    topicNote: "",
    topicSourceDetail: "",
    topicSource: "pending",
    fakeDefinitions: {
      [host.id]: ["host definition"],
      [dummyTwo.id]: ["removed definition"],
      [dummyThree.id]: ["retained definition"],
    },
    options: [],
    votes: {
      [host.id]: "option-host",
      [dummyTwo.id]: "option-removed",
      [dummyThree.id]: "option-retained",
    },
    scores: {
      [host.id]: 1,
      [dummyTwo.id]: 2,
      [dummyThree.id]: 3,
    },
    resultText: "",
    createdAt: 1,
    updatedAt: 1,
  };
}

test("たほい屋のダミー名は途中削除後も重複しない", () => {
  assert.equal(nextTahoiyaDebugPlayerName([host, dummyThree]), "テスト4");
});

test("指定したたほい屋ダミーだけを関連状態ごと削除する", () => {
  const removed = removeTahoiyaDebugParticipants(makeRoom(), dummyTwo.id);

  assert.deepEqual(removed.players.map((player) => player.id), [host.id, dummyThree.id]);
  assert.equal(removed.answererId, "");
  assert.deepEqual(Object.keys(removed.fakeDefinitions).sort(), [dummyThree.id, host.id].sort());
  assert.deepEqual(Object.keys(removed.votes).sort(), [dummyThree.id, host.id].sort());
  assert.deepEqual(Object.keys(removed.scores).sort(), [dummyThree.id, host.id].sort());
  assert.deepEqual(Object.keys(removed.playerTimeouts).sort(), [dummyThree.id, host.id].sort());
  assert.equal(removed.playerTimeoutNotice, null);
  assert.deepEqual(removed.lobbyReturn?.returnedPlayerIds, [host.id, dummyThree.id]);
});

test("DEBUGをOFFにするとたほい屋の全ダミーを整理する", () => {
  const removed = removeTahoiyaDebugParticipants(makeRoom());

  assert.deepEqual(removed.players, [host]);
  assert.deepEqual(removed.scores, { [host.id]: 1 });
  assert.deepEqual(removed.lobbyReturn?.returnedPlayerIds, [host.id]);
});
