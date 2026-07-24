"use client";

import {
  PlayingCardHand as GameSdkPlayingCardHand,
  type PlayingCardSize,
} from "@game-fields/game-sdk/playing-cards-react";
import type {
  PlayingCard as PlayingCardValue,
} from "@game-fields/game-sdk/playing-cards";
import { useAppLocale } from "./AppLocaleProvider";

type PlayingCardHandProps = {
  cards: readonly PlayingCardValue[];
  selectedCardIds?: ReadonlySet<string> | readonly string[];
  disabledCardIds?: ReadonlySet<string> | readonly string[];
  size?: PlayingCardSize;
  label?: string;
  onCardClick?: (card: PlayingCardValue) => void;
};

export function PlayingCardHand(props: PlayingCardHandProps) {
  const { locale } = useAppLocale();
  return <GameSdkPlayingCardHand {...props} locale={locale} />;
}
