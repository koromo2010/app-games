import type { PlayingCard } from "./playing-cards.ts";

export type PresentedPlayingCardHand = {
  cardCount: number;
  cards: PlayingCard[] | null;
};

export type PresentPlayingCardHandsOptions = {
  revealAll?: boolean;
  revealedPlayerIds?: readonly string[];
};

export function presentPlayingCardHands(
  hands: Readonly<Record<string, readonly PlayingCard[]>>,
  viewerId: string,
  options: PresentPlayingCardHandsOptions = {},
) {
  const revealedPlayerIds = new Set(options.revealedPlayerIds ?? []);
  return Object.fromEntries(Object.entries(hands).map(([playerId, cards]) => {
    const visible = options.revealAll || playerId === viewerId || revealedPlayerIds.has(playerId);
    return [playerId, { cardCount: cards.length, cards: visible ? [...cards] : null } satisfies PresentedPlayingCardHand];
  })) as Record<string, PresentedPlayingCardHand>;
}
