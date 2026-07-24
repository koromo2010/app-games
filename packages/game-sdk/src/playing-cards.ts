export const playingCardSuits = [
  "spades",
  "hearts",
  "diamonds",
  "clubs",
] as const;
export const playingCardRanks = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;

export type PlayingCardSuit = (typeof playingCardSuits)[number];
export type PlayingCardRank = (typeof playingCardRanks)[number];

export type StandardPlayingCard = {
  readonly id: string;
  readonly kind: "standard";
  readonly deckIndex: number;
  readonly suit: PlayingCardSuit;
  readonly rank: PlayingCardRank;
};

export type JokerPlayingCard = {
  readonly id: string;
  readonly kind: "joker";
  readonly deckIndex: number;
  readonly jokerIndex: number;
};

export type PlayingCard = StandardPlayingCard | JokerPlayingCard;
export type PlayingCardRandomInteger = (upperExclusive: number) => number;
export type StandardDeckOptions = {
  deckCount?: number;
  jokersPerDeck?: number;
};
export type DealPlayingCardsOptions = {
  cardsPerPlayer?: number;
  startPlayerIndex?: number;
};
export type DealtPlayingCards<T> = {
  hands: Record<string, T[]>;
  stock: T[];
};
export type TakenCards<T> = {
  taken: T[];
  remaining: T[];
};
export type PresentedPlayingCardHand = {
  cardCount: number;
  cards: PlayingCard[] | null;
};
export type PresentPlayingCardHandsOptions = {
  revealAll?: boolean;
  revealedPlayerIds?: readonly string[];
};

const maximumDeckCount = 8;
const maximumJokersPerDeck = 4;
export const maximumPlayingCardCollectionSize = 512;
const randomIntegerRange = 0x1_0000_0000;

const suitLabels: Record<PlayingCardSuit, { ja: string; en: string }> = {
  spades: { ja: "スペード", en: "Spades" },
  hearts: { ja: "ハート", en: "Hearts" },
  diamonds: { ja: "ダイヤ", en: "Diamonds" },
  clubs: { ja: "クラブ", en: "Clubs" },
};
const suitSymbols: Record<PlayingCardSuit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

function positiveInteger(value: number, maximum: number, field: string) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`PLAYING_CARDS_INVALID_${field}`);
  }
  return value;
}

function nonNegativeInteger(value: number, maximum: number, field: string) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`PLAYING_CARDS_INVALID_${field}`);
  }
  return value;
}

export function standardPlayingCardId(
  deckIndex: number,
  suit: PlayingCardSuit,
  rank: PlayingCardRank,
) {
  return `standard:${deckIndex}:${suit}:${rank}`;
}

export function jokerPlayingCardId(
  deckIndex: number,
  jokerIndex: number,
) {
  return `joker:${deckIndex}:${jokerIndex}`;
}

export function createStandardPlayingCardDeck(
  options: StandardDeckOptions = {},
): PlayingCard[] {
  const deckCount = positiveInteger(
    options.deckCount ?? 1,
    maximumDeckCount,
    "DECK_COUNT",
  );
  const jokersPerDeck = nonNegativeInteger(
    options.jokersPerDeck ?? 0,
    maximumJokersPerDeck,
    "JOKER_COUNT",
  );
  const cards: PlayingCard[] = [];
  for (let deckIndex = 1; deckIndex <= deckCount; deckIndex += 1) {
    for (const suit of playingCardSuits) {
      for (const rank of playingCardRanks) {
        cards.push({
          id: standardPlayingCardId(deckIndex, suit, rank),
          kind: "standard",
          deckIndex,
          suit,
          rank,
        });
      }
    }
    for (
      let jokerIndex = 1;
      jokerIndex <= jokersPerDeck;
      jokerIndex += 1
    ) {
      cards.push({
        id: jokerPlayingCardId(deckIndex, jokerIndex),
        kind: "joker",
        deckIndex,
        jokerIndex,
      });
    }
  }
  return cards;
}

export function isPlayingCard(value: unknown): value is PlayingCard {
  if (!value || typeof value !== "object") return false;
  const parsed = value as Partial<PlayingCard>;
  if (
    typeof parsed.id !== "string"
    || !Number.isInteger(parsed.deckIndex)
    || (parsed.deckIndex ?? 0) < 1
  ) {
    return false;
  }
  if (parsed.kind === "standard") {
    return (
      typeof parsed.suit === "string"
      && playingCardSuits.includes(parsed.suit as PlayingCardSuit)
      && typeof parsed.rank === "string"
      && playingCardRanks.includes(parsed.rank as PlayingCardRank)
      && parsed.id === standardPlayingCardId(
        parsed.deckIndex!,
        parsed.suit as PlayingCardSuit,
        parsed.rank as PlayingCardRank,
      )
    );
  }
  return (
    parsed.kind === "joker"
    && Number.isInteger(parsed.jokerIndex)
    && (parsed.jokerIndex ?? 0) >= 1
    && parsed.id === jokerPlayingCardId(
      parsed.deckIndex!,
      parsed.jokerIndex!,
    )
  );
}

export function isPlayingCardCollection(
  value: unknown,
  maximumCards = maximumPlayingCardCollectionSize,
): value is PlayingCard[] {
  if (
    !Number.isInteger(maximumCards)
    || maximumCards < 0
    || maximumCards > maximumPlayingCardCollectionSize
  ) {
    return false;
  }
  if (
    !Array.isArray(value)
    || value.length > maximumCards
    || !value.every(isPlayingCard)
  ) {
    return false;
  }
  return new Set(value.map((card) => card.id)).size === value.length;
}

export function playingCardSuitLabel(
  suit: PlayingCardSuit,
  locale: "ja" | "en" = "ja",
) {
  return suitLabels[suit][locale];
}

export function playingCardSuitSymbol(suit: PlayingCardSuit) {
  return suitSymbols[suit];
}

export function playingCardLabel(
  card: PlayingCard,
  locale: "ja" | "en" = "ja",
) {
  if (card.kind === "joker") {
    return locale === "ja"
      ? `ジョーカー${card.jokerIndex}`
      : `Joker ${card.jokerIndex}`;
  }
  return locale === "ja"
    ? `${playingCardSuitLabel(card.suit, locale)}の${card.rank}`
    : `${playingCardSuitLabel(card.suit, locale)} ${card.rank}`;
}

export function securePlayingCardRandomInteger(upperExclusive: number) {
  if (
    !Number.isInteger(upperExclusive)
    || upperExclusive < 1
    || upperExclusive > randomIntegerRange
  ) {
    throw new Error("PLAYING_CARDS_INVALID_RANDOM_RANGE");
  }
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("PLAYING_CARDS_SECURE_RANDOM_UNAVAILABLE");
  }
  const acceptableLimit =
    Math.floor(randomIntegerRange / upperExclusive) * upperExclusive;
  const values = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(values);
  } while (values[0]! >= acceptableLimit);
  return values[0]! % upperExclusive;
}

export function shufflePlayingCards<T>(
  cards: readonly T[],
  randomInteger: PlayingCardRandomInteger =
    securePlayingCardRandomInteger,
) {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = randomInteger(index + 1);
    if (
      !Number.isInteger(targetIndex)
      || targetIndex < 0
      || targetIndex > index
    ) {
      throw new Error("PLAYING_CARDS_INVALID_RANDOM_RESULT");
    }
    [shuffled[index], shuffled[targetIndex]] = [
      shuffled[targetIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}

export function dealPlayingCardsRoundRobin<T>(
  cards: readonly T[],
  playerIds: readonly string[],
  options: DealPlayingCardsOptions = {},
): DealtPlayingCards<T> {
  if (
    playerIds.length === 0
    || playerIds.some((playerId) => !playerId.trim())
    || new Set(playerIds).size !== playerIds.length
  ) {
    throw new Error("PLAYING_CARDS_INVALID_PLAYERS");
  }
  const startPlayerIndex = options.startPlayerIndex ?? 0;
  if (
    !Number.isInteger(startPlayerIndex)
    || startPlayerIndex < 0
    || startPlayerIndex >= playerIds.length
  ) {
    throw new Error("PLAYING_CARDS_INVALID_START_PLAYER");
  }
  const cardsPerPlayer = options.cardsPerPlayer;
  if (
    cardsPerPlayer !== undefined
    && (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer < 0)
  ) {
    throw new Error("PLAYING_CARDS_INVALID_HAND_SIZE");
  }
  const dealCount = cardsPerPlayer === undefined
    ? cards.length
    : Math.min(cards.length, cardsPerPlayer * playerIds.length);
  const hands = Object.fromEntries(
    playerIds.map((playerId) => [playerId, [] as T[]]),
  ) as Record<string, T[]>;
  for (let index = 0; index < dealCount; index += 1) {
    const playerId =
      playerIds[(startPlayerIndex + index) % playerIds.length]!;
    hands[playerId]!.push(cards[index]!);
  }
  return { hands, stock: cards.slice(dealCount) };
}

export function takeCardsById<T extends { readonly id: string }>(
  cards: readonly T[],
  cardIds: readonly string[],
): TakenCards<T> {
  if (
    new Set(cards.map((card) => card.id)).size !== cards.length
    || new Set(cardIds).size !== cardIds.length
  ) {
    throw new Error("PLAYING_CARDS_DUPLICATE_CARD_ID");
  }
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const taken = cardIds.map((cardId) => {
    const card = cardById.get(cardId);
    if (!card) throw new Error("PLAYING_CARDS_CARD_NOT_IN_HAND");
    return card;
  });
  const selectedIds = new Set(cardIds);
  return {
    taken,
    remaining: cards.filter((card) => !selectedIds.has(card.id)),
  };
}

export function sortPlayingCardsForDisplay(
  cards: readonly PlayingCard[],
) {
  const rankIndex = new Map(
    playingCardRanks.map((rank, index) => [rank, index]),
  );
  const suitIndex = new Map(
    playingCardSuits.map((suit, index) => [suit, index]),
  );
  return [...cards].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "joker" ? 1 : -1;
    if (left.kind === "joker" && right.kind === "joker") {
      return (
        left.deckIndex - right.deckIndex
        || left.jokerIndex - right.jokerIndex
      );
    }
    if (left.kind !== "standard" || right.kind !== "standard") return 0;
    return (
      (suitIndex.get(left.suit) ?? 0)
        - (suitIndex.get(right.suit) ?? 0)
      || (rankIndex.get(left.rank) ?? 0)
        - (rankIndex.get(right.rank) ?? 0)
      || left.deckIndex - right.deckIndex
    );
  });
}

export function presentPlayingCardHands(
  hands: Readonly<Record<string, readonly PlayingCard[]>>,
  viewerId: string,
  options: PresentPlayingCardHandsOptions = {},
) {
  const revealedPlayerIds = new Set(options.revealedPlayerIds ?? []);
  return Object.fromEntries(
    Object.entries(hands).map(([playerId, cards]) => {
      const visible =
        options.revealAll
        || playerId === viewerId
        || revealedPlayerIds.has(playerId);
      return [
        playerId,
        {
          cardCount: cards.length,
          cards: visible ? [...cards] : null,
        } satisfies PresentedPlayingCardHand,
      ];
    }),
  ) as Record<string, PresentedPlayingCardHand>;
}
