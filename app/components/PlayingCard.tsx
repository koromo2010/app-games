"use client";

import type { MouseEventHandler } from "react";
import {
  PlayingCardView,
  type PlayingCardSize,
} from "@game-fields/game-sdk/playing-cards-react";
import type {
  PlayingCard as PlayingCardValue,
} from "@game-fields/game-sdk/playing-cards";
import { useAppLocale } from "./AppLocaleProvider";

export type { PlayingCardSize };

type PlayingCardProps = {
  card?: PlayingCardValue | null;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  size?: PlayingCardSize;
  className?: string;
  ariaLabel?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export function PlayingCard(props: PlayingCardProps) {
  const { locale } = useAppLocale();
  return <PlayingCardView {...props} locale={locale} />;
}
