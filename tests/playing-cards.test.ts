import assert from "node:assert/strict";
import test from "node:test";
import { presentPlayingCardHands } from "../lib/playing-card-presentation.ts";
import {
  createStandardPlayingCardDeck,
  dealPlayingCardsRoundRobin,
  isPlayingCardCollection,
  isPlayingCard,
  playingCardLabel,
  shufflePlayingCards,
  sortPlayingCardsForDisplay,
  takeCardsById,
} from "../lib/playing-cards.ts";

test("標準52枚と指定枚数のジョーカーを重複しないIDで生成する", () => {
  const deck = createStandardPlayingCardDeck({ jokersPerDeck: 2 });
  assert.equal(deck.length, 54);
  assert.equal(new Set(deck.map((card) => card.id)).size, 54);
  assert.equal(deck.filter((card) => card.kind === "standard").length, 52);
  assert.equal(deck.filter((card) => card.kind === "joker").length, 2);
  assert.ok(deck.every(isPlayingCard));
});

test("複数デッキでもカード個体のIDを区別する", () => {
  const deck = createStandardPlayingCardDeck({ deckCount: 2, jokersPerDeck: 1 });
  assert.equal(deck.length, 106);
  assert.equal(new Set(deck.map((card) => card.id)).size, 106);
  assert.equal(deck.at(-1)?.id, "joker:2:1");
});

test("シャッフルは元配列を変更せず、注入した乱数だけで再現できる", () => {
  const source = [1, 2, 3, 4];
  const shuffled = shufflePlayingCards(source, () => 0);
  assert.deepEqual(source, [1, 2, 3, 4]);
  assert.deepEqual(shuffled, [2, 3, 4, 1]);
  assert.throws(() => shufflePlayingCards(source, (upperExclusive) => upperExclusive), /PLAYING_CARDS_INVALID_RANDOM_RESULT/);
});

test("全カードを参加者へ1枚ずつ均等に配る", () => {
  const deck = createStandardPlayingCardDeck({ jokersPerDeck: 1 });
  const dealt = dealPlayingCardsRoundRobin(deck, ["a", "b", "c", "d"]);
  assert.deepEqual(Object.values(dealt.hands).map((hand) => hand.length), [14, 13, 13, 13]);
  assert.equal(dealt.stock.length, 0);
  assert.equal(new Set(Object.values(dealt.hands).flat().map((card) => card.id)).size, 53);
});

test("配布枚数と最初に受け取る参加者を指定し、残りを山札へ残す", () => {
  const dealt = dealPlayingCardsRoundRobin([1, 2, 3, 4, 5, 6, 7], ["a", "b", "c"], { cardsPerPlayer: 2, startPlayerIndex: 1 });
  assert.deepEqual(dealt.hands, { a: [3, 6], b: [1, 4], c: [2, 5] });
  assert.deepEqual(dealt.stock, [7]);
});

test("閲覧者本人以外にはカードIDを渡さず枚数だけを返す", () => {
  const deck = createStandardPlayingCardDeck();
  const hands = dealPlayingCardsRoundRobin(deck.slice(0, 6), ["a", "b"]).hands;
  const presented = presentPlayingCardHands(hands, "a");
  assert.deepEqual(presented.a.cards?.map((card) => card.id), hands.a.map((card) => card.id));
  assert.equal(presented.a.cardCount, 3);
  assert.equal(presented.b.cards, null);
  assert.equal(presented.b.cardCount, 3);
  assert.equal(JSON.stringify(presented.b).includes(hands.b[0].id), false);
});

test("保存されたカード配列は形式・上限・ID重複をまとめて検証する", () => {
  const deck = createStandardPlayingCardDeck({ jokersPerDeck: 1 });
  assert.equal(isPlayingCardCollection(deck), true);
  assert.equal(isPlayingCardCollection(deck, 52), false);
  assert.equal(isPlayingCardCollection([deck[0], deck[0]]), false);
  assert.equal(isPlayingCardCollection([{ ...deck[0], rank: "K" }]), false);
});

test("手札から指定カードだけを順序どおり取り出し、元の手札は変更しない", () => {
  const hand = createStandardPlayingCardDeck().slice(0, 4);
  const result = takeCardsById(hand, [hand[2].id, hand[0].id]);
  assert.deepEqual(result.taken.map((card) => card.id), [hand[2].id, hand[0].id]);
  assert.deepEqual(result.remaining.map((card) => card.id), [hand[1].id, hand[3].id]);
  assert.equal(hand.length, 4);
  assert.throws(() => takeCardsById(hand, [hand[0].id, hand[0].id]), /PLAYING_CARDS_DUPLICATE_CARD_ID/);
  assert.throws(() => takeCardsById(hand, ["unknown"]), /PLAYING_CARDS_CARD_NOT_IN_HAND/);
});

test("表示用ソートと日本語読み上げ名をゲームの強さ判定から独立して提供する", () => {
  const deck = createStandardPlayingCardDeck({ jokersPerDeck: 1 });
  const cards = sortPlayingCardsForDisplay([deck.at(-1)!, deck[13], deck[0], deck[1]]);
  assert.deepEqual(cards.map((card) => card.id), ["standard:1:spades:A", "standard:1:spades:2", "standard:1:hearts:A", "joker:1:1"]);
  assert.equal(playingCardLabel(cards[0]), "スペードのA");
  assert.equal(playingCardLabel(cards.at(-1)!), "ジョーカー1");
});

test("不正なデッキ設定・参加者・カード形式を拒否する", () => {
  assert.throws(() => createStandardPlayingCardDeck({ deckCount: 0 }), /PLAYING_CARDS_INVALID_DECK_COUNT/);
  assert.throws(() => createStandardPlayingCardDeck({ jokersPerDeck: -1 }), /PLAYING_CARDS_INVALID_JOKER_COUNT/);
  assert.throws(() => dealPlayingCardsRoundRobin([1], []), /PLAYING_CARDS_INVALID_PLAYERS/);
  assert.throws(() => dealPlayingCardsRoundRobin([1], ["a", "a"]), /PLAYING_CARDS_INVALID_PLAYERS/);
  assert.equal(isPlayingCard({ id: "standard:1:spades:A", kind: "standard", deckIndex: 1, suit: "spades", rank: "K" }), false);
});
