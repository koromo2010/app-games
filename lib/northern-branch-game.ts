import { createNorthernOfferDeck, northernBuildings, northernCards, northernCardLabel, shuffle } from "@/lib/northern-branch-data";
import type { NorthernActionResult, NorthernBuildingId, NorthernCardId, NorthernGameAction, NorthernGameState, NorthernOffer, NorthernPlayer } from "@/lib/northern-branch-types";

const handLimit = 7;
const victoryPoints = 10;

function makePlayer(name: string, index: number): NorthernPlayer {
  return {
    id: `player-${index + 1}`,
    name: name.trim() || `プレイヤー${index + 1}`,
    hand: [`fund-${index + 3}` as NorthernCardId],
    buildings: [], usedBuildings: [], points: 0,
  };
}

function drawOffers(state: NorthernGameState): NorthernGameState {
  let deck = [...state.offerDeck];
  let discard = [...state.discard];
  const offers = [...state.offers];
  while (offers.length < 5) {
    if (!deck.length) {
      if (!discard.length) break;
      deck = shuffle(discard); discard = [];
    }
    const next = deck.shift();
    if (next) offers.push(next);
  }
  return { ...state, offers, offerDeck: deck, discard };
}

export function createNorthernGame(playerNames: string[]): NorthernGameState {
  return drawOffers({
    status: "playing", players: playerNames.slice(0, 4).map(makePlayer), activePlayerIndex: 0,
    turn: 1, mainActionUsed: false, offerDeck: createNorthernOfferDeck(), offers: [], discard: [],
    winnerId: null, log: ["北の都で商会経営を始めました。"],
  });
}

function result(state: NorthernGameState, ok: boolean, notice: string): NorthernActionResult {
  if (!ok) return { ok: false, state, notice };
  const winner = state.players.find((player) => player.points >= victoryPoints);
  if (!winner) return { ok: true, state, notice };
  const finished = { ...state, status: "finished" as const, winnerId: winner.id, log: [`${winner.name}が10点に到達しました。`, ...state.log].slice(0, 30) };
  return { ok: true, state: finished, notice: `${winner.name}の勝利です！` };
}

function removeIndexes(hand: NorthernCardId[], indexes: number[]) {
  const selected = new Set(indexes);
  return hand.filter((_, index) => !selected.has(index));
}

function consume(hand: NorthernCardId[], recipe: Partial<Record<NorthernCardId, number>>) {
  const remaining = [...hand];
  for (const [cardId, count] of Object.entries(recipe) as [NorthernCardId, number][]) {
    for (let index = 0; index < count; index += 1) {
      const target = remaining.indexOf(cardId);
      if (target < 0) return null;
      remaining.splice(target, 1);
    }
  }
  return remaining;
}

function replacePlayer(state: NorthernGameState, player: NorthernPlayer) {
  const players = [...state.players];
  players[state.activePlayerIndex] = player;
  return { ...state, players };
}

function takeOffer(state: NorthernGameState, offer: NorthernOffer) {
  return drawOffers({ ...state, offers: state.offers.filter((item) => item.id !== offer.id), discard: [...state.discard, offer] });
}

function log(state: NorthernGameState, message: string) {
  return { ...state, log: [message, ...state.log].slice(0, 30) };
}

function runBuilding(state: NorthernGameState, buildingId: NorthernBuildingId): NorthernActionResult {
  const player = state.players[state.activePlayerIndex];
  if (!player?.buildings.includes(buildingId)) return result(state, false, "その建物は所有していません。");
  if (player.usedBuildings.includes(buildingId)) return result(state, false, "この建物は今のターンに使用済みです。");
  let hand = [...player.hand];
  let points = player.points;
  const add = (cardId: NorthernCardId) => hand.length < handLimit ? Boolean(hand.push(cardId)) : false;
  if (buildingId === "mine" && !add("ore")) return result(state, false, "手札が7枚です。");
  if (buildingId === "malt-house" && !add("barley")) return result(state, false, "手札が7枚です。");
  if (buildingId === "sawmill" && !add("wood")) return result(state, false, "手札が7枚です。");
  if (buildingId === "stable" && !add("pig")) return result(state, false, "手札が7枚です。");
  if (buildingId === "recycler") {
    const next = consume(hand, { dung: 1, wood: 1 });
    if (!next) return result(state, false, "ダング1枚と木材1枚が必要です。");
    hand = [...next, "fuel"];
  }
  if (buildingId === "workshop") {
    const next = consume(hand, { ore: 1, wood: 1 });
    if (!next) return result(state, false, "鉱石1枚と木材1枚が必要です。");
    hand = [...next, "ingot"];
  }
  if (buildingId === "trading-post") {
    const index = hand.findIndex((id) => northernCards[id].kind === "product");
    if (index < 0) return result(state, false, "売れる商品がありません。");
    hand.splice(index, 1); points += 1;
  }
  if (buildingId === "guild-hall") {
    const indexes = hand.map((id, index) => ({ id, index })).filter(({ id }) => northernCards[id].kind === "product").slice(0, 2).map(({ index }) => index);
    if (indexes.length < 2) return result(state, false, "商品が2枚必要です。");
    hand = removeIndexes(hand, indexes); points += 2;
  }
  const nextPlayer = { ...player, hand, points, usedBuildings: [...player.usedBuildings, buildingId] };
  const next = log(replacePlayer(state, nextPlayer), `${player.name}：${northernBuildings[buildingId].name}を使用`);
  return result(next, true, `${northernBuildings[buildingId].name}を使いました。`);
}

export function applyNorthernAction(state: NorthernGameState, action: NorthernGameAction): NorthernActionResult {
  if (state.status !== "playing") return result(state, false, "ゲームは終了しています。");
  const player = state.players[state.activePlayerIndex];
  if (!player) return result(state, false, "手番プレイヤーが見つかりません。");
  if (action.type === "use-building") return runBuilding(state, action.buildingId);

  if (action.type === "take-resource") {
    if (state.mainActionUsed) return result(state, false, "通常アクションは使用済みです。");
    const resources: NorthernCardId[] = ["ore", "barley", "wood", "wool", "herb", "pig", "chicken"];
    if (!resources.includes(action.cardId)) return result(state, false, "選べない資源です。");
    if (player.hand.length >= handLimit) return result(state, false, "手札が7枚です。");
    const next = log(replacePlayer({ ...state, mainActionUsed: true }, { ...player, hand: [...player.hand, action.cardId] }), `${player.name}：${northernCardLabel(action.cardId)}を入手`);
    return result(next, true, `${northernCardLabel(action.cardId)}を得ました。`);
  }

  if (action.type === "produce") {
    if (state.mainActionUsed) return result(state, false, "通常アクションは使用済みです。");
    const offer = state.offers.find((item) => item.id === action.offerId);
    if (!offer || offer.kind !== "product") return result(state, false, "その商品は市場にありません。");
    const card = northernCards[offer.cardId];
    const remaining = card.recipe ? consume(player.hand, card.recipe) : null;
    if (!remaining) return result(state, false, "生産素材が足りません。");
    let next = replacePlayer({ ...state, mainActionUsed: true }, { ...player, hand: [...remaining, offer.cardId] });
    next = takeOffer(next, offer);
    next = log(next, `${player.name}：${card.name}を生産`);
    return result(next, true, `${card.name}を生産しました。`);
  }

  if (action.type === "buy") {
    if (state.mainActionUsed) return result(state, false, "通常アクションは使用済みです。");
    const offer = state.offers.find((item) => item.id === action.offerId);
    if (!offer) return result(state, false, "そのカードは市場にありません。");
    const indexes = [...new Set(action.paymentIndexes)].filter((index) => index >= 0 && index < player.hand.length);
    const payment = indexes.reduce((sum, index) => sum + northernCards[player.hand[index]].value, 0);
    const cost = offer.kind === "product" ? northernCards[offer.cardId].value : northernBuildings[offer.buildingId].cost;
    if (payment < cost) return result(state, false, `支払価値が不足しています（必要${cost}）。`);
    if (offer.kind === "product" && player.hand.length - indexes.length + 1 > handLimit) return result(state, false, "購入後の手札が7枚を超えます。");
    if (offer.kind === "building" && player.buildings.includes(offer.buildingId)) return result(state, false, "同じ建物は2軒建てられません。");
    const hand = removeIndexes(player.hand, indexes);
    const nextPlayer: NorthernPlayer = offer.kind === "product"
      ? { ...player, hand: [...hand, offer.cardId] }
      : { ...player, hand, buildings: [...player.buildings, offer.buildingId], points: player.points + northernBuildings[offer.buildingId].points };
    let next = takeOffer(replacePlayer({ ...state, mainActionUsed: true }, nextPlayer), offer);
    const name = offer.kind === "product" ? northernCardLabel(offer.cardId) : northernBuildings[offer.buildingId].name;
    next = log(next, `${player.name}：${name}を売買で入手`);
    return result(next, true, `${name}を入手しました。お釣りはありません。`);
  }

  if (!state.mainActionUsed) return result(state, false, "通常アクションを1回行ってください。");
  const hand = [...player.hand];
  const hasLivestock = hand.some((id) => id === "pig" || id === "chicken");
  const gainedDung = hasLivestock && hand.length < handLimit;
  if (gainedDung) hand.push("dung");
  const players = [...state.players];
  players[state.activePlayerIndex] = { ...player, hand, usedBuildings: [] };
  const activePlayerIndex = (state.activePlayerIndex + 1) % players.length;
  const turn = activePlayerIndex === 0 ? state.turn + 1 : state.turn;
  const next = log({ ...state, players, activePlayerIndex, turn, mainActionUsed: false }, gainedDung ? `${player.name}：家畜からダングが発生` : `${player.name}：手番終了`);
  return result(next, true, gainedDung ? "ダングを受け取り、次の人へ交代しました。" : "次の人へ交代しました。");
}

export const northernRules = { handLimit, victoryPoints };
