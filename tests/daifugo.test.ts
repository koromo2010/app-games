import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDaifugoMeld,
  chooseDaifugoCpuPlay,
  createDaifugoGame,
  createDaifugoGameForPlayers,
  daifugoCardStrength,
  daifugoPlayError,
  passDaifugoTurn,
  playDaifugoCards,
  type DaifugoGameState,
} from "../lib/daifugo.ts";
import { createStandardPlayingCardDeck, type PlayingCard } from "../lib/playing-cards.ts";
import { expireDaifugoTurn } from "../lib/daifugo-room-domain.ts";
import { normalizeDaifugoRoom } from "../lib/daifugo-room-normalizer.ts";
import { sanitizeDaifugoRoom, type DaifugoRoom } from "../lib/daifugo-room.ts";

const deck = createStandardPlayingCardDeck({ jokersPerDeck: 1 });
const card = (idPart: string) => {
  const found = deck.find((candidate) => candidate.id.includes(idPart));
  assert.ok(found, `card ${idPart} should exist`);
  return found;
};

function stateWith(overrides: Partial<DaifugoGameState> = {}): DaifugoGameState {
  const players = [
    { id: "a", name: "A", kind: "human" as const },
    { id: "b", name: "B", kind: "cpu" as const },
    { id: "c", name: "C", kind: "cpu" as const },
    { id: "d", name: "D", kind: "cpu" as const },
  ];
  return {
    status: "playing",
    players,
    hands: {
      a: [card(":diamonds:3"), card(":spades:4")],
      b: [card(":hearts:5")],
      c: [card(":clubs:6")],
      d: [card(":spades:7")],
    },
    currentPlayerId: "a",
    table: null,
    lastPlayedById: null,
    passedPlayerIds: [],
    finishOrder: [],
    firstPlay: false,
    turnNumber: 1,
    lastAction: null,
    ...overrides,
  };
}

function onlineRoom(overrides: Partial<DaifugoRoom> = {}): DaifugoRoom {
  const players = ["a", "b", "c"].map((id, index) => ({ id, name: id.toUpperCase(), joinedAt: index + 1, avatarColor: "#38bdf8" }));
  const game = createDaifugoGameForPlayers(players.map((player) => ({ id: player.id, name: player.name, kind: "human" })), { randomInteger: () => 0 });
  return { code: "AB12", hostId: "a", passphrase: "secret", phase: "playing", players, playerCapacity: 4, turnTimeLimitSeconds: 30, revision: 0, createdAt: 1, updatedAt: 1, gameNumber: 1, gameStartedAt: 1, phaseStartedAt: 1_000, game, debugMode: false, debugReplayEnabled: false, debugLog: [], ...overrides };
}

test("オンライン表示は本人以外のカードIDと合言葉を隠す", () => {
  const room = onlineRoom();
  const view = sanitizeDaifugoRoom(room, "a");
  assert.equal(view.hasPassphrase, true);
  assert.equal("passphrase" in view, false);
  assert.equal(view.game?.hands.a.length, room.game?.hands.a.length);
  assert.equal(view.game?.hands.b.length, 0);
  assert.equal(view.game?.handCounts.b, room.game?.hands.b.length);
});

test("デバッグ中も全手札を見られるのはホストだけ", () => {
  const room = onlineRoom({ debugMode: true });
  assert.ok((sanitizeDaifugoRoom(room, "a").game?.hands.b.length ?? 0) > 0);
  assert.equal(sanitizeDaifugoRoom(room, "b").game?.hands.a.length, 0);
});

test("保存されたオンライン部屋を検証して復元する", () => {
  const room = onlineRoom();
  const normalized = normalizeDaifugoRoom(JSON.parse(JSON.stringify(room)));
  assert.ok(normalized);
  assert.equal(normalized.code, room.code);
  assert.equal(normalized.game?.currentPlayerId, room.game?.currentPlayerId);
  assert.deepEqual(normalized.game?.hands, room.game?.hands);
  assert.equal(normalizeDaifugoRoom({ ...room, code: "bad" }), null);
});

test("場が空の手番が時間切れになると最弱の合法手を自動で出す", () => {
  const room = onlineRoom();
  const currentPlayerId = room.game!.currentPlayerId!;
  const expired = expireDaifugoTurn(room, room.phaseStartedAt!, 31_001);
  assert.equal(expired.game?.turnNumber, room.game!.turnNumber + 1);
  assert.equal(expired.game?.lastAction?.playerId, currentPlayerId);
  assert.equal(expired.game?.lastAction?.type, "play");
});

test("大富豪の強さは3から2、単独ジョーカーの順になる", () => {
  assert.ok(daifugoCardStrength(card(":spades:3")) < daifugoCardStrength(card(":spades:A")));
  assert.ok(daifugoCardStrength(card(":spades:A")) < daifugoCardStrength(card(":spades:2")));
  assert.ok(daifugoCardStrength(card("joker:")) > daifugoCardStrength(card(":spades:2")));
});

test("同じ数字とジョーカーは組になり、異なる数字は組にならない", () => {
  const pair = analyzeDaifugoMeld([card(":spades:8"), card(":hearts:8")]);
  const wildPair = analyzeDaifugoMeld([card(":spades:8"), card("joker:")]);
  assert.equal(pair?.count, 2);
  assert.equal(wildPair?.strength, pair?.strength);
  assert.equal(analyzeDaifugoMeld([card(":spades:8"), card(":hearts:9")]), null);
  assert.equal(analyzeDaifugoMeld([
    card(":spades:8"),
    card(":hearts:8"),
    card(":diamonds:8"),
    card(":clubs:8"),
    card("joker:"),
  ]), null);
});

test("初手のプレイヤーはダイヤの3を持ち、初手にはそのカードが必要", () => {
  const state = createDaifugoGame({ randomInteger: () => 0 });
  assert.ok(state.currentPlayerId);
  assert.ok(state.hands[state.currentPlayerId].some((value) => value.kind === "standard" && value.suit === "diamonds" && value.rank === "3"));
  const another = state.hands[state.currentPlayerId].find((value) => !(value.kind === "standard" && value.suit === "diamonds" && value.rank === "3"));
  assert.ok(another);
  assert.match(daifugoPlayError(state, state.currentPlayerId, [another.id]) ?? "", /ダイヤの3/);
});

test("場と同じ枚数で、より強い組だけを出せる", () => {
  const tableCards = [card(":spades:5"), card(":hearts:5")];
  const state = stateWith({
    currentPlayerId: "a",
    hands: { a: [card(":spades:6"), card(":hearts:6"), card(":clubs:7")], b: [], c: [], d: [] },
    table: analyzeDaifugoMeld(tableCards),
    lastPlayedById: "b",
  });
  assert.equal(daifugoPlayError(state, "a", [card(":spades:6").id, card(":hearts:6").id]), null);
  assert.match(daifugoPlayError(state, "a", [card(":clubs:7").id]) ?? "", /同じ2枚/);
});

test("ほかの全員がパスすると場が流れ、最後に出した人から再開する", () => {
  const table = analyzeDaifugoMeld([card(":spades:4")]);
  let state = stateWith({ currentPlayerId: "c", table, lastPlayedById: "a", passedPlayerIds: ["b"] });
  state = passDaifugoTurn(state, "c");
  assert.equal(state.currentPlayerId, "d");
  state = passDaifugoTurn(state, "d");
  assert.equal(state.table, null);
  assert.equal(state.currentPlayerId, "a");
  assert.deepEqual(state.passedPlayerIds, []);
});

test("手札をなくした順に順位が確定する", () => {
  let state = stateWith({ hands: { a: [card(":diamonds:3")], b: [card(":hearts:5")], c: [card(":clubs:6")], d: [card(":spades:7")] } });
  state = playDaifugoCards(state, "a", [card(":diamonds:3").id]);
  assert.deepEqual(state.finishOrder, ["a"]);
  assert.equal(state.currentPlayerId, "b");
});

test("異なる配札でもCPUの合法手だけで停止せず最後まで終了する", () => {
  for (let seed = 1; seed <= 250; seed += 1) {
    let randomState = seed >>> 0;
    const randomInteger = (upperExclusive: number) => {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      randomState >>>= 0;
      return randomState % upperExclusive;
    };
    let state = createDaifugoGame({ randomInteger });
    for (let step = 0; step < 1000 && state.status === "playing"; step += 1) {
      const playerId = state.currentPlayerId!;
      assert.ok(!state.finishOrder.includes(playerId));
      if (state.table) assert.ok(!state.passedPlayerIds.includes(playerId));
      const selected: PlayingCard[] | null = chooseDaifugoCpuPlay(state, playerId);
      state = selected
        ? playDaifugoCards(state, playerId, selected.map((value) => value.id))
        : passDaifugoTurn(state, playerId);
    }
    assert.equal(state.status, "finished", `配札seed ${seed}が停止しました`);
    assert.equal(state.finishOrder.length, 4);
    assert.equal(new Set(state.finishOrder).size, 4);
    for (const playerId of state.finishOrder.slice(0, 3)) assert.equal(state.hands[playerId].length, 0);
    assert.ok(state.hands[state.finishOrder[3]].length > 0);
  }
});
