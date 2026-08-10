import assert from "node:assert/strict";
import test from "node:test";
import {
  createStandardPlayingCardDeck,
  dealPlayingCardsRoundRobin,
  presentPlayingCardHands,
  shufflePlayingCards,
  takeCardsById,
  type PlayingCard,
} from "@game-fields/game-sdk/playing-cards";
import {
  defineGameSdkStandardResult,
  gameSdkPlayerSeat,
  gameSdkPlayerSeats,
  nextGameSdkEligibleSeat,
} from "@game-fields/game-sdk/modules";

type PlayerId = "baba" | "child";

type BabaFixture = {
  players: Array<{ id: PlayerId }>;
  hands: Record<PlayerId, PlayingCard[]>;
  actorId: PlayerId;
  phase: "playing" | "result";
  discardedPairIds: string[];
  winnerId: PlayerId | null;
};

function card(deck: PlayingCard[], id: string) {
  const found = deck.find((item) => item.id === id);
  if (!found) throw new Error(`fixture card missing: ${id}`);
  return found;
}

function createBabaFixture(): BabaFixture {
  const deck = createStandardPlayingCardDeck();
  const shortened = [
    card(deck, "standard:1:hearts:A"),
    card(deck, "standard:1:spades:A"),
    card(deck, "standard:1:clubs:2"),
    card(deck, "standard:1:diamonds:3"),
  ];
  const shuffled = shufflePlayingCards(shortened, (upperExclusive) => upperExclusive - 1);
  const dealt = dealPlayingCardsRoundRobin(shuffled, ["baba", "child"] satisfies PlayerId[]);
  return {
    players: [{ id: "baba" }, { id: "child" }],
    hands: {
      baba: dealt.hands.baba ?? [],
      child: dealt.hands.child ?? [],
    },
    actorId: "baba",
    phase: "playing",
    discardedPairIds: [],
    winnerId: null,
  };
}

function discardPairs(cards: PlayingCard[]) {
  const remaining = [...cards];
  const discarded: PlayingCard[] = [];
  for (const candidate of [...remaining]) {
    if (candidate.kind !== "standard") continue;
    const mateIndex = remaining.findIndex((other) => (
      other.id !== candidate.id
      && other.kind === "standard"
      && other.rank === candidate.rank
    ));
    const candidateIndex = remaining.findIndex((other) => other.id === candidate.id);
    if (candidateIndex < 0 || mateIndex < 0) continue;
    const [first] = remaining.splice(Math.max(candidateIndex, mateIndex), 1);
    const [second] = remaining.splice(Math.min(candidateIndex, mateIndex), 1);
    if (first && second) discarded.push(first, second);
  }
  return { remaining, discarded };
}

function drawFromOpponent(
  state: BabaFixture,
  actorId: PlayerId,
  opponentId: PlayerId,
  cardId: string,
): BabaFixture {
  assert.equal(state.phase, "playing");
  assert.equal(state.actorId, actorId);
  const draw = takeCardsById(state.hands[opponentId], [cardId]);
  const paired = discardPairs([...state.hands[actorId], ...draw.taken]);
  const hands = {
    ...state.hands,
    [actorId]: paired.remaining,
    [opponentId]: draw.remaining,
  };
  const winnerId = state.players.find((player) => hands[player.id].length === 0)?.id ?? null;
  const currentSeat = gameSdkPlayerSeat(state.players, actorId);
  const nextSeat = nextGameSdkEligibleSeat(
    state.players.map((player) => player.id),
    currentSeat,
    winnerId ? [winnerId] : [],
  );
  return {
    ...state,
    hands,
    actorId: winnerId ? actorId : state.players[nextSeat]!.id,
    phase: winnerId ? "result" : "playing",
    discardedPairIds: [
      ...state.discardedPairIds,
      ...paired.discarded.map((item) => item.id),
    ],
    winnerId,
  };
}

test("Baba fixture uses official cards and helpers through draw, pair, turn, result and reset", () => {
  const initial = createBabaFixture();
  const privateView = presentPlayingCardHands(initial.hands, "baba");
  assert.equal(privateView.baba?.cards?.length, 2);
  assert.equal(privateView.child?.cards, null);
  assert.equal(gameSdkPlayerSeat(initial.players, "baba"), 0);
  assert.deepEqual(gameSdkPlayerSeats(initial.players, ["baba", "child"]), [0, 1]);

  const afterPair = drawFromOpponent(
    initial,
    "baba",
    "child",
    "standard:1:spades:A",
  );
  assert.deepEqual(afterPair.hands.baba.map((item) => item.id), ["standard:1:clubs:2"]);
  assert.equal(afterPair.hands.child.length, 1);
  assert.equal(afterPair.discardedPairIds.length, 2);
  assert.equal(afterPair.actorId, "child");

  const completed = drawFromOpponent(
    afterPair,
    "child",
    "baba",
    "standard:1:clubs:2",
  );
  assert.equal(completed.phase, "result");
  assert.equal(completed.winnerId, "baba");
  const result = defineGameSdkStandardResult({
    winnerIds: [completed.winnerId!],
    rankings: [
      { participantId: "baba", rank: 1, score: 1 },
      { participantId: "child", rank: 2, score: 0 },
    ],
    reason: "first-empty-hand",
    presentation: {
      reason: { ja: "最初に手札をなくしました。", en: "First to empty the hand." },
    },
  }, { participantIds: ["baba", "child"] });
  assert.deepEqual(result.winnerIds, ["baba"]);

  const reset = createBabaFixture();
  assert.equal(reset.phase, "playing");
  assert.equal(reset.actorId, "baba");
  assert.deepEqual(
    Object.values(reset.hands).flat().map((item) => item.id),
    Object.values(initial.hands).flat().map((item) => item.id),
  );
});
