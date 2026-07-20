import type { MouseEventHandler } from "react";
import {
  playingCardLabel,
  playingCardSuitSymbol,
  type PlayingCard as PlayingCardValue,
} from "@/lib/playing-cards";

export type PlayingCardSize = "xs" | "sm" | "md" | "lg";

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

const sizeClasses: Record<PlayingCardSize, string> = {
  xs: "w-10 rounded-md text-[10px]",
  sm: "w-14 rounded-lg text-xs",
  md: "w-20 rounded-xl text-sm",
  lg: "w-28 rounded-2xl text-base",
};

const centerClasses: Record<PlayingCardSize, string> = {
  xs: "text-lg",
  sm: "text-2xl",
  md: "text-4xl",
  lg: "text-5xl",
};

function CardFace({ card, size }: { card: PlayingCardValue; size: PlayingCardSize }) {
  if (card.kind === "joker") {
    return <>
      <span className="absolute left-1.5 top-1 font-black text-fuchsia-700">J</span>
      <span className={`font-black tracking-tighter text-fuchsia-700 ${centerClasses[size]}`}>★</span>
      <span className="absolute bottom-1 right-1.5 rotate-180 font-black text-cyan-700">J</span>
    </>;
  }
  const symbol = playingCardSuitSymbol(card.suit);
  const color = card.suit === "hearts" || card.suit === "diamonds" ? "text-red-600" : "text-slate-950";
  return <>
    <span className={`absolute left-1.5 top-1 flex flex-col items-center font-black leading-none ${color}`}><span>{card.rank}</span><span>{symbol}</span></span>
    <span className={`font-black ${color} ${centerClasses[size]}`}>{card.rank === "J" || card.rank === "Q" || card.rank === "K" ? card.rank : symbol}</span>
    <span className={`absolute bottom-1 right-1.5 flex rotate-180 flex-col items-center font-black leading-none ${color}`}><span>{card.rank}</span><span>{symbol}</span></span>
  </>;
}

function CardBack() {
  return <div
    aria-hidden="true"
    className="absolute inset-1.5 rounded-[inherit] border border-cyan-100/80 bg-slate-900 shadow-inner"
    style={{ backgroundImage: "linear-gradient(135deg, rgba(34,211,238,.55) 25%, transparent 25%), linear-gradient(225deg, rgba(251,191,36,.45) 25%, transparent 25%), linear-gradient(45deg, rgba(244,114,182,.35) 25%, transparent 25%), linear-gradient(315deg, rgba(255,255,255,.18) 25%, #0f172a 25%)", backgroundPosition: "8px 0, 8px 0, 0 0, 0 0", backgroundSize: "16px 16px" }}
  />;
}

export function PlayingCard({ card = null, faceDown = false, selected = false, disabled = false, size = "md", className = "", ariaLabel, onClick }: PlayingCardProps) {
  const hidden = faceDown || !card;
  const label = ariaLabel ?? (hidden ? "裏向きのカード" : playingCardLabel(card));
  const classes = `relative inline-flex aspect-[5/7] shrink-0 items-center justify-center overflow-hidden border bg-white shadow-md transition ${sizeClasses[size]} ${selected ? "-translate-y-2 border-amber-300 ring-4 ring-amber-300/45" : "border-slate-300"} ${disabled ? "opacity-45" : ""} ${onClick && !disabled ? "cursor-pointer hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/60" : ""} ${className}`;
  const content = hidden ? <CardBack /> : <CardFace card={card} size={size} />;
  if (onClick) {
    return <button type="button" className={classes} aria-label={label} aria-pressed={selected} disabled={disabled} onClick={onClick}>{content}</button>;
  }
  return <span className={classes} role="img" aria-label={label}>{content}</span>;
}
