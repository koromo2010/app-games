"use client";

import type {
  CSSProperties,
  MouseEventHandler,
} from "react";
import {
  playingCardLabel,
  playingCardSuitSymbol,
  type PlayingCard,
} from "./playing-cards.js";

export type PlayingCardSize = "xs" | "sm" | "md" | "lg";

export type PlayingCardViewProps = {
  card?: PlayingCard | null;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  size?: PlayingCardSize;
  locale?: "ja" | "en";
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export type PlayingCardHandProps = {
  cards: readonly PlayingCard[];
  selectedCardIds?: ReadonlySet<string> | readonly string[];
  disabledCardIds?: ReadonlySet<string> | readonly string[];
  size?: PlayingCardSize;
  locale?: "ja" | "en";
  label?: string;
  className?: string;
  style?: CSSProperties;
  onCardClick?: (card: PlayingCard) => void;
};

export type PlayingCardBackStackProps = {
  count: number;
  size?: PlayingCardSize;
  locale?: "ja" | "en";
  label?: string;
  maximumVisibleCards?: number;
  className?: string;
  style?: CSSProperties;
};

const sizes: Record<
  PlayingCardSize,
  { width: number; radius: number; corner: number; center: number }
> = {
  xs: { width: 40, radius: 6, corner: 10, center: 18 },
  sm: { width: 56, radius: 8, corner: 12, center: 24 },
  md: { width: 80, radius: 12, corner: 14, center: 36 },
  lg: { width: 112, radius: 16, corner: 16, center: 48 },
};

function CardFace({
  card,
  size,
}: {
  card: PlayingCard;
  size: PlayingCardSize;
}) {
  const metrics = sizes[size];
  if (card.kind === "joker") {
    return (
      <>
        <span style={cornerStyle("left", metrics.corner, "#a21caf")}>J</span>
        <span
          style={{
            color: "#a21caf",
            fontSize: metrics.center,
            fontWeight: 900,
          }}
        >
          ★
        </span>
        <span style={cornerStyle("right", metrics.corner, "#0e7490")}>J</span>
      </>
    );
  }
  const symbol = playingCardSuitSymbol(card.suit);
  const color =
    card.suit === "hearts" || card.suit === "diamonds"
      ? "#dc2626"
      : "#020617";
  return (
    <>
      <span style={cornerStyle("left", metrics.corner, color)}>
        <span>{card.rank}</span>
        <span>{symbol}</span>
      </span>
      <span
        style={{
          color,
          fontSize: metrics.center,
          fontWeight: 900,
        }}
      >
        {["J", "Q", "K"].includes(card.rank) ? card.rank : symbol}
      </span>
      <span style={cornerStyle("right", metrics.corner, color)}>
        <span>{card.rank}</span>
        <span>{symbol}</span>
      </span>
    </>
  );
}

function cornerStyle(
  side: "left" | "right",
  fontSize: number,
  color: string,
): CSSProperties {
  return {
    position: "absolute",
    top: side === "left" ? 5 : undefined,
    left: side === "left" ? 6 : undefined,
    right: side === "right" ? 6 : undefined,
    bottom: side === "right" ? 5 : undefined,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    color,
    fontSize,
    fontWeight: 900,
    lineHeight: 0.95,
    transform: side === "right" ? "rotate(180deg)" : undefined,
  };
}

function CardBack() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 6,
        borderRadius: "inherit",
        border: "1px solid rgba(207,250,254,.8)",
        backgroundColor: "#0f172a",
        backgroundImage:
          "linear-gradient(135deg, rgba(34,211,238,.55) 25%, transparent 25%), linear-gradient(225deg, rgba(251,191,36,.45) 25%, transparent 25%), linear-gradient(45deg, rgba(244,114,182,.35) 25%, transparent 25%), linear-gradient(315deg, rgba(255,255,255,.18) 25%, #0f172a 25%)",
        backgroundPosition: "8px 0, 8px 0, 0 0, 0 0",
        backgroundSize: "16px 16px",
        boxShadow: "inset 0 2px 5px rgba(0,0,0,.35)",
      }}
    />
  );
}

export function PlayingCardView({
  card = null,
  faceDown = false,
  selected = false,
  disabled = false,
  size = "md",
  locale = "ja",
  className = "",
  style,
  ariaLabel,
  onClick,
}: PlayingCardViewProps) {
  const hidden = faceDown || !card;
  const label =
    ariaLabel
    ?? (hidden
      ? locale === "ja" ? "裏向きのカード" : "Face-down card"
      : playingCardLabel(card, locale));
  const metrics = sizes[size];
  const commonStyle: CSSProperties = {
    position: "relative",
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    width: metrics.width,
    aspectRatio: "5 / 7",
    borderRadius: metrics.radius,
    border: selected ? "2px solid #fcd34d" : "1px solid #cbd5e1",
    background: "#ffffff",
    boxShadow: selected
      ? "0 0 0 4px rgba(252,211,77,.42), 0 10px 18px rgba(15,23,42,.2)"
      : "0 5px 12px rgba(15,23,42,.18)",
    transform: selected ? "translateY(-8px)" : undefined,
    opacity: disabled ? 0.45 : 1,
    cursor: onClick && !disabled ? "pointer" : "default",
    transition: "transform 150ms, box-shadow 150ms",
    padding: 0,
    ...style,
  };
  const content = hidden ? <CardBack /> : <CardFace card={card} size={size} />;
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        style={commonStyle}
        aria-label={label}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }
  return (
    <span
      className={className}
      style={commonStyle}
      role="img"
      aria-label={label}
    >
      {content}
    </span>
  );
}

function valueSet(
  values: ReadonlySet<string> | readonly string[] | undefined,
) {
  return new Set(values ?? []);
}

export function PlayingCardHand({
  cards,
  selectedCardIds,
  disabledCardIds,
  size = "md",
  locale = "ja",
  label,
  className = "",
  style,
  onCardClick,
}: PlayingCardHandProps) {
  const selected = valueSet(selectedCardIds);
  const disabled = valueSet(disabledCardIds);
  const overlap = Math.round(sizes[size].width * -0.42);
  return (
    <ul
      className={className}
      style={{
        display: "flex",
        minWidth: 0,
        alignItems: "flex-end",
        overflowX: "auto",
        margin: 0,
        padding: "20px 12px 16px",
        listStyle: "none",
        ...style,
      }}
      aria-label={
        label ?? (locale === "ja" ? "手札" : "Playing-card hand")
      }
    >
      {cards.map((card, index) => (
        <li
          key={card.id}
          style={{
            position: "relative",
            flexShrink: 0,
            marginLeft: index === 0 ? 0 : overlap,
            zIndex: selected.has(card.id) ? 10 : index,
          }}
        >
          <PlayingCardView
            card={card}
            size={size}
            locale={locale}
            selected={selected.has(card.id)}
            disabled={disabled.has(card.id)}
            onClick={
              onCardClick ? () => onCardClick(card) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );
}

export function PlayingCardBackStack({
  count,
  size = "sm",
  locale = "ja",
  label,
  maximumVisibleCards = 7,
  className = "",
  style,
}: PlayingCardBackStackProps) {
  const safeCount = Number.isFinite(count)
    ? Math.max(0, Math.floor(count))
    : 0;
  const visibleLimit = Number.isFinite(maximumVisibleCards)
    ? Math.max(1, Math.floor(maximumVisibleCards))
    : 7;
  const visibleCount = Math.min(safeCount, visibleLimit);
  const overlap = Math.round(sizes[size].width * -0.42);
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "flex-end", ...style }}
      role="img"
      aria-label={
        label
        ?? (locale === "ja"
          ? `裏向きのカード${safeCount}枚`
          : `${safeCount} face-down cards`)
      }
    >
      {Array.from({ length: visibleCount }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          style={{
            position: "relative",
            flexShrink: 0,
            marginLeft: index === 0 ? 0 : overlap,
          }}
        >
          <PlayingCardView faceDown size={size} locale={locale} />
        </span>
      ))}
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          zIndex: 20,
          marginLeft: -12,
          borderRadius: 999,
          background: "#fcd34d",
          color: "#020617",
          padding: "4px 8px",
          fontSize: 12,
          fontWeight: 900,
          boxShadow: "0 3px 8px rgba(15,23,42,.22)",
        }}
      >
        {locale === "ja" ? `${safeCount}枚` : safeCount}
      </span>
    </div>
  );
}
