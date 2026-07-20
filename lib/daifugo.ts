import {
  createStandardPlayingCardDeck,
  dealPlayingCardsRoundRobin,
  shufflePlayingCards,
  takeCardsById,
  type PlayingCard,
  type PlayingCardRandomInteger,
  type PlayingCardRank,
  type StandardPlayingCard,
} from "./playing-cards.ts";

export const daifugoPlayerIds = ["you", "cpu-1", "cpu-2", "cpu-3"] as const;

export type DaifugoPlayer = {
  id: string;
  name: string;
  kind: "human" | "cpu";
};

export type DaifugoMeld = {
  cards: PlayingCard[];
  count: number;
  strength: number;
  label: string;
};

export type DaifugoLastAction = {
  playerId: string;
  type: "play" | "pass";
  cardCount: number;
};

export type DaifugoGameState = {
  status: "playing" | "finished";
  players: DaifugoPlayer[];
  hands: Record<string, PlayingCard[]>;
  currentPlayerId: string | null;
  table: DaifugoMeld | null;
  lastPlayedById: string | null;
  passedPlayerIds: string[];
  finishOrder: string[];
  firstPlay: boolean;
  turnNumber: number;
  lastAction: DaifugoLastAction | null;
};

export type CreateDaifugoGameOptions = {
  humanName?: string;
  randomInteger?: PlayingCardRandomInteger;
};

export type CreateDaifugoGameForPlayersOptions = {
  randomInteger?: PlayingCardRandomInteger;
};

const rankStrength: Record<PlayingCardRank, number> = {
  "3": 0,
  "4": 1,
  "5": 2,
  "6": 3,
  "7": 4,
  "8": 5,
  "9": 6,
  "10": 7,
  J: 8,
  Q: 9,
  K: 10,
  A: 11,
  "2": 12,
};

const strengthLabel = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "ジョーカー"] as const;
export const maximumDaifugoMeldSize = 4;

function playerIndex(state: DaifugoGameState, playerId: string) {
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index < 0) throw new Error("DAIFUGO_UNKNOWN_PLAYER");
  return index;
}

function finishedPlayerIds(state: DaifugoGameState) {
  return new Set(state.finishOrder);
}

function nextPlayerId(state: DaifugoGameState, afterPlayerId: string, excludedPlayerIds: ReadonlySet<string>) {
  const startIndex = playerIndex(state, afterPlayerId);
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(startIndex + offset) % state.players.length];
    if (!excludedPlayerIds.has(candidate.id)) return candidate.id;
  }
  return null;
}

function diamondThree(card: PlayingCard): card is StandardPlayingCard {
  return card.kind === "standard" && card.suit === "diamonds" && card.rank === "3";
}

export function daifugoCardStrength(card: PlayingCard) {
  return card.kind === "joker" ? 13 : rankStrength[card.rank];
}

export function sortDaifugoHand(cards: readonly PlayingCard[]) {
  const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 } as const;
  return [...cards].sort((left, right) => {
    const strengthDifference = daifugoCardStrength(left) - daifugoCardStrength(right);
    if (strengthDifference !== 0) return strengthDifference;
    if (left.kind === "joker" || right.kind === "joker") return left.kind === "joker" ? 1 : -1;
    return suitOrder[left.suit] - suitOrder[right.suit];
  });
}

export function analyzeDaifugoMeld(cards: readonly PlayingCard[]): DaifugoMeld | null {
  if (cards.length === 0 || cards.length > maximumDaifugoMeldSize) return null;
  const jokers = cards.filter((card) => card.kind === "joker");
  const standards = cards.filter((card): card is StandardPlayingCard => card.kind === "standard");
  if (jokers.length > 1 || (standards.length === 0 && cards.length !== 1)) return null;
  const ranks = new Set(standards.map((card) => card.rank));
  if (ranks.size > 1) return null;
  const strength = standards.length === 0 ? 13 : rankStrength[standards[0].rank];
  return {
    cards: [...cards],
    count: cards.length,
    strength,
    label: cards.length === 1 && jokers.length === 1
      ? "ジョーカー"
      : `${strengthLabel[strength]}の${cards.length}枚組`,
  };
}

export function daifugoPlayError(state: DaifugoGameState, playerId: string, cardIds: readonly string[]) {
  if (state.status !== "playing") return "ゲームは終了しています。";
  if (state.currentPlayerId !== playerId) return "いまはあなたの番ではありません。";
  if (cardIds.length === 0) return "出すカードを選んでください。";
  let selected: PlayingCard[];
  try {
    selected = takeCardsById(state.hands[playerId] ?? [], cardIds).taken;
  } catch {
    return "手札にないカードが含まれています。";
  }
  const meld = analyzeDaifugoMeld(selected);
  if (!meld) return "同じ数字のカードだけを組にできます。ジョーカーは代用できます。";
  if (state.firstPlay && !selected.some(diamondThree)) return "最初はダイヤの3を含めて出してください。";
  if (state.table && meld.count !== state.table.count) return `場と同じ${state.table.count}枚を出してください。`;
  if (state.table && meld.strength <= state.table.strength) return "場より強い数字を出してください。";
  return null;
}

export function canPassDaifugoTurn(state: DaifugoGameState, playerId: string) {
  return state.status === "playing" && state.currentPlayerId === playerId && state.table !== null && !state.firstPlay;
}

function finishGameIfNeeded(state: DaifugoGameState) {
  const unfinished = state.players.filter((player) => !state.finishOrder.includes(player.id));
  if (unfinished.length > 1) return state;
  const finishOrder = unfinished.length === 1 ? [...state.finishOrder, unfinished[0].id] : state.finishOrder;
  return { ...state, status: "finished" as const, currentPlayerId: null, finishOrder };
}

function clearTrick(state: DaifugoGameState, leaderId: string) {
  const finished = finishedPlayerIds(state);
  const currentPlayerId = finished.has(leaderId)
    ? nextPlayerId(state, leaderId, finished)
    : leaderId;
  return {
    ...state,
    table: null,
    lastPlayedById: null,
    passedPlayerIds: [],
    currentPlayerId,
  };
}

export function playDaifugoCards(state: DaifugoGameState, playerId: string, cardIds: readonly string[]) {
  const error = daifugoPlayError(state, playerId, cardIds);
  if (error) throw new Error(error);
  const { taken, remaining } = takeCardsById(state.hands[playerId], cardIds);
  const meld = analyzeDaifugoMeld(taken)!;
  const finishOrder = remaining.length === 0 ? [...state.finishOrder, playerId] : state.finishOrder;
  let next: DaifugoGameState = {
    ...state,
    hands: { ...state.hands, [playerId]: remaining },
    table: meld,
    lastPlayedById: playerId,
    finishOrder,
    firstPlay: false,
    turnNumber: state.turnNumber + 1,
    lastAction: { playerId, type: "play", cardCount: taken.length },
  };
  next = finishGameIfNeeded(next);
  if (next.status === "finished") return next;

  const excluded = new Set([...next.finishOrder, ...next.passedPlayerIds]);
  const nextId = nextPlayerId(next, playerId, excluded);
  if (nextId && nextId !== playerId) return { ...next, currentPlayerId: nextId };
  return clearTrick(next, playerId);
}

export function passDaifugoTurn(state: DaifugoGameState, playerId: string) {
  if (!canPassDaifugoTurn(state, playerId)) throw new Error("いまはパスできません。");
  const passedPlayerIds = [...state.passedPlayerIds, playerId];
  const next: DaifugoGameState = {
    ...state,
    passedPlayerIds,
    turnNumber: state.turnNumber + 1,
    lastAction: { playerId, type: "pass", cardCount: 0 },
  };
  const finished = finishedPlayerIds(next);
  const challengers = next.players.filter((player) =>
    !finished.has(player.id)
    && !passedPlayerIds.includes(player.id)
    && player.id !== next.lastPlayedById,
  );
  if (challengers.length === 0) return clearTrick(next, next.lastPlayedById!);
  const excluded = new Set([...next.finishOrder, ...passedPlayerIds]);
  const nextId = nextPlayerId(next, playerId, excluded);
  if (!nextId) return clearTrick(next, next.lastPlayedById!);
  return { ...next, currentPlayerId: nextId };
}

function candidateMelds(hand: readonly PlayingCard[]) {
  const joker = hand.find((card) => card.kind === "joker");
  const standardsByRank = new Map<PlayingCardRank, PlayingCard[]>();
  for (const card of hand) {
    if (card.kind === "joker") continue;
    const rankCards = standardsByRank.get(card.rank) ?? [];
    rankCards.push(card);
    standardsByRank.set(card.rank, rankCards);
  }
  const candidates: PlayingCard[][] = hand.map((card) => [card]);
  for (const rankCards of standardsByRank.values()) {
    for (let count = 2; count <= rankCards.length; count += 1) candidates.push(rankCards.slice(0, count));
    if (joker) {
      for (let count = 2; count <= Math.min(rankCards.length + 1, maximumDaifugoMeldSize); count += 1) {
        candidates.push([...rankCards.slice(0, count - 1), joker]);
      }
    }
  }
  return candidates;
}

export function listLegalDaifugoPlays(state: DaifugoGameState, playerId: string) {
  if (state.currentPlayerId !== playerId || state.status !== "playing") return [];
  return candidateMelds(state.hands[playerId] ?? [])
    .filter((cards) => daifugoPlayError(state, playerId, cards.map((card) => card.id)) === null)
    .sort((left, right) => {
      const leftMeld = analyzeDaifugoMeld(left)!;
      const rightMeld = analyzeDaifugoMeld(right)!;
      return leftMeld.strength - rightMeld.strength
        || (state.table ? leftMeld.count - rightMeld.count : rightMeld.count - leftMeld.count)
        || Number(left.some((card) => card.kind === "joker")) - Number(right.some((card) => card.kind === "joker"));
    });
}

export function chooseDaifugoCpuPlay(state: DaifugoGameState, playerId: string) {
  return listLegalDaifugoPlays(state, playerId)[0] ?? null;
}

export function createDaifugoGameForPlayers(players: readonly DaifugoPlayer[], options: CreateDaifugoGameForPlayersOptions = {}): DaifugoGameState {
  if (players.length < 3 || players.length > 6 || players.some((player) => !player.id.trim()) || new Set(players.map((player) => player.id)).size !== players.length) {
    throw new Error("DAIFUGO_INVALID_PLAYERS");
  }
  const normalizedPlayers = players.map((player) => ({ ...player, name: player.name.trim().slice(0, 40) || "プレイヤー" }));
  const deck = shufflePlayingCards(
    createStandardPlayingCardDeck({ jokersPerDeck: 1 }),
    options.randomInteger,
  );
  const dealt = dealPlayingCardsRoundRobin(deck, normalizedPlayers.map((player) => player.id));
  const starter = normalizedPlayers.find((player) => dealt.hands[player.id].some(diamondThree));
  if (!starter) throw new Error("DAIFUGO_START_CARD_MISSING");
  return {
    status: "playing",
    players: normalizedPlayers,
    hands: Object.fromEntries(normalizedPlayers.map((player) => [player.id, sortDaifugoHand(dealt.hands[player.id])])),
    currentPlayerId: starter.id,
    table: null,
    lastPlayedById: null,
    passedPlayerIds: [],
    finishOrder: [],
    firstPlay: true,
    turnNumber: 1,
    lastAction: null,
  };
}

export function createDaifugoGame(options: CreateDaifugoGameOptions = {}): DaifugoGameState {
  return createDaifugoGameForPlayers([
    { id: daifugoPlayerIds[0], name: options.humanName?.trim().slice(0, 20) || "あなた", kind: "human" },
    { id: daifugoPlayerIds[1], name: "CPU アオ", kind: "cpu" },
    { id: daifugoPlayerIds[2], name: "CPU モモ", kind: "cpu" },
    { id: daifugoPlayerIds[3], name: "CPU キイ", kind: "cpu" },
  ], { randomInteger: options.randomInteger });
}
