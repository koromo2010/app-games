"use client";

import { useMemo, useState } from "react";
import { PlayingCardBackStack } from "@/app/components/PlayingCardBackStack";
import { PlayingCardHand } from "@/app/components/PlayingCardHand";
import { presentPlayingCardHands } from "@/lib/playing-card-presentation";
import {
  createStandardPlayingCardDeck,
  dealPlayingCardsRoundRobin,
  playingCardLabel,
  shufflePlayingCards,
  sortPlayingCardsForDisplay,
  type PlayingCard,
} from "@/lib/playing-cards";

const allPlayers = [
  { id: "player-1", name: "あなた" },
  { id: "player-2", name: "PLAYER 2" },
  { id: "player-3", name: "PLAYER 3" },
  { id: "player-4", name: "PLAYER 4" },
  { id: "player-5", name: "PLAYER 5" },
  { id: "player-6", name: "PLAYER 6" },
] as const;

function newHands(playerCount: number, jokersPerDeck: number, shuffled: boolean) {
  const players = allPlayers.slice(0, playerCount);
  const deck = createStandardPlayingCardDeck({ jokersPerDeck });
  const cards = shuffled ? shufflePlayingCards(deck) : deck;
  return dealPlayingCardsRoundRobin(cards, players.map((player) => player.id)).hands;
}

export function PlayingCardsPlayground() {
  const [playerCount, setPlayerCount] = useState(4);
  const [jokersPerDeck, setJokersPerDeck] = useState(1);
  const [hands, setHands] = useState<Record<string, PlayingCard[]>>(() => newHands(4, 1, false));
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => new Set());
  const players = allPlayers.slice(0, playerCount);
  const presentedHands = useMemo(() => presentPlayingCardHands(hands, "player-1"), [hands]);
  const ownCards = useMemo(() => sortPlayingCardsForDisplay(presentedHands["player-1"]?.cards ?? []), [presentedHands]);
  const selectedLabels = ownCards
    .filter((card) => selectedCardIds.has(card.id))
    .map((card) => playingCardLabel(card));

  const redeal = () => {
    setHands(newHands(playerCount, jokersPerDeck, true));
    setSelectedCardIds(new Set());
  };

  const changePlayerCount = (count: number) => {
    setPlayerCount(count);
    setHands(newHands(count, jokersPerDeck, true));
    setSelectedCardIds(new Set());
  };

  const changeJokerCount = (count: number) => {
    setJokersPerDeck(count);
    setHands(newHands(playerCount, count, true));
    setSelectedCardIds(new Set());
  };

  const toggleCard = (card: PlayingCard) => {
    setSelectedCardIds((current) => {
      const next = new Set(current);
      if (next.has(card.id)) next.delete(card.id);
      else next.add(card.id);
      return next;
    });
  };

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#164e63_0,#0f172a_42%,#020617_100%)] px-4 py-8 text-white sm:px-6">
    <div className="mx-auto max-w-6xl">
      <div className="rounded-3xl border border-white/10 bg-slate-950/75 p-5 shadow-2xl backdrop-blur sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Development playground</p>
        <h1 className="mt-2 text-3xl font-black sm:text-5xl">共通トランプ基盤</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold leading-7 text-slate-300">カード生成、安全なシャッフル、均等配札、本人だけに見える手札、選択操作を確認する開発専用ページです。ゲーム固有の強さや役判定は含めません。</p>

        <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm font-bold text-slate-200">参加人数
            <select value={playerCount} onChange={(event) => changePlayerCount(Number(event.target.value))} className="mt-2 block w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-white">
              {[2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}人</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-200">ジョーカー
            <select value={jokersPerDeck} onChange={(event) => changeJokerCount(Number(event.target.value))} className="mt-2 block w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-white">
              {[0, 1, 2].map((count) => <option key={count} value={count}>{count}枚</option>)}
            </select>
          </label>
          <button type="button" onClick={redeal} className="rounded-xl bg-amber-300 px-5 py-3 font-black text-slate-950 shadow-lg transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200/50">シャッフルして配る</button>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="他のプレイヤーの手札">
          {players.slice(1).map((player) => {
            const hand = presentedHands[player.id];
            return <div key={player.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3"><h2 className="font-black text-cyan-100">{player.name}</h2><span className="text-xs font-bold text-slate-400">内容は非公開</span></div>
              <div className="mt-3"><PlayingCardBackStack count={hand?.cardCount ?? 0} /></div>
            </div>;
          })}
        </section>

        <section className="mt-6 rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.06] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">あなたの手札</h2><p className="mt-1 text-xs font-bold text-slate-400">カードを押すと複数選択できます</p></div><span className="rounded-full bg-cyan-300 px-3 py-1 text-sm font-black text-cyan-950">{ownCards.length}枚</span></div>
          <PlayingCardHand cards={ownCards} selectedCardIds={selectedCardIds} onCardClick={toggleCard} />
          <div className="min-h-12 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-300">
            <span className="font-black text-amber-300">選択中：</span>{selectedLabels.length > 0 ? selectedLabels.join("、") : "なし"}
          </div>
        </section>
      </div>
    </div>
  </main>;
}
