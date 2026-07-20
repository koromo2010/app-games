import { PlayingCard, type PlayingCardSize } from "@/app/components/PlayingCard";
import type { PlayingCard as PlayingCardValue } from "@/lib/playing-cards";

type PlayingCardHandProps = {
  cards: readonly PlayingCardValue[];
  selectedCardIds?: ReadonlySet<string> | readonly string[];
  disabledCardIds?: ReadonlySet<string> | readonly string[];
  size?: PlayingCardSize;
  label?: string;
  onCardClick?: (card: PlayingCardValue) => void;
};

const handOverlapClasses: Record<PlayingCardSize, string> = {
  xs: "-ml-5 first:ml-0",
  sm: "-ml-7 first:ml-0 sm:-ml-5",
  md: "-ml-10 first:ml-0 sm:-ml-7",
  lg: "-ml-14 first:ml-0 sm:-ml-10",
};

function valueSet(values: ReadonlySet<string> | readonly string[] | undefined) {
  return new Set(values ?? []);
}

export function PlayingCardHand({ cards, selectedCardIds, disabledCardIds, size = "md", label = "手札", onCardClick }: PlayingCardHandProps) {
  const selected = valueSet(selectedCardIds);
  const disabled = valueSet(disabledCardIds);
  return <ul className="flex min-w-0 items-end overflow-x-auto px-3 pb-4 pt-5" aria-label={label}>
    {cards.map((card) => <li key={card.id} className={`relative shrink-0 transition hover:z-20 focus-within:z-20 ${handOverlapClasses[size]} ${selected.has(card.id) ? "z-10" : ""}`}>
      <PlayingCard card={card} size={size} selected={selected.has(card.id)} disabled={disabled.has(card.id)} onClick={onCardClick ? () => onCardClick(card) : undefined} />
    </li>)}
  </ul>;
}
