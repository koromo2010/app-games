"use client";

import {
  PlayingCardBackStack as GameSdkPlayingCardBackStack,
  type PlayingCardSize,
} from "@game-fields/game-sdk/playing-cards-react";
import { useAppLocale } from "./AppLocaleProvider";

type PlayingCardBackStackProps = {
  count: number;
  size?: PlayingCardSize;
  label?: string;
  maximumVisibleCards?: number;
};

export function PlayingCardBackStack(props: PlayingCardBackStackProps) {
  const { locale } = useAppLocale();
  return <GameSdkPlayingCardBackStack {...props} locale={locale} />;
}
