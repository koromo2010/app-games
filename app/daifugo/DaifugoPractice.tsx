"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { PlayingCardHand } from "@/app/components/PlayingCardHand";
import {
  canPassDaifugoTurn,
  chooseDaifugoCpuPlay,
  createDaifugoGame,
  daifugoPlayError,
  passDaifugoTurn,
  playDaifugoCards,
  sortDaifugoHand,
  type DaifugoGameState,
} from "@/lib/daifugo";
import { fallbackAvatarColor, readPlayerSession, type PlayerSession } from "@/lib/player-session";
import { DaifugoRulesDialog } from "./DaifugoRulesDialog";
import { DaifugoTable } from "./DaifugoTable";

const rankNames = ["大富豪", "富豪", "貧民", "大貧民"];

export function DaifugoPracticeGame() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [game, setGame] = useState<DaifugoGameState | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [run, setRun] = useState<{ id: string; startedAt: number } | null>(null);
  const reportedRunIds = useRef(new Set<string>());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedSession = readPlayerSession();
      setSession(storedSession);
      setGame(createDaifugoGame({ humanName: storedSession?.name }));
      setRun({ id: crypto.randomUUID(), startedAt: Date.now() });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!game || game.status !== "playing") return;
    const current = game.players.find((player) => player.id === game.currentPlayerId);
    if (current?.kind !== "cpu") return;
    const timer = window.setTimeout(() => {
      setGame((latest) => {
        if (!latest || latest.status !== "playing" || latest.currentPlayerId !== current.id) return latest;
        const cards = chooseDaifugoCpuPlay(latest, current.id);
        return cards
          ? playDaifugoCards(latest, current.id, cards.map((card) => card.id))
          : passDaifugoTurn(latest, current.id);
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [game]);

  useEffect(() => {
    if (game?.status !== "finished" || !run || !session?.id || reportedRunIds.current.has(run.id)) return;
    reportedRunIds.current.add(run.id);
    void fetch("/api/game-duration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "daifugo", id: run.id, startedAt: run.startedAt }),
    }).catch(() => undefined);
  }, [game?.status, run, session?.id]);

  const startNewGame = () => {
    setSelectedCardIds([]);
    setNotice("");
    setGame(createDaifugoGame({ humanName: session?.name }));
    setRun({ id: crypto.randomUUID(), startedAt: Date.now() });
  };

  const toggleCard = (cardId: string) => {
    if (!game || game.currentPlayerId !== "you" || game.status !== "playing") return;
    setNotice("");
    setSelectedCardIds((current) => current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]);
  };

  const playSelected = () => {
    if (!game) return;
    const error = daifugoPlayError(game, "you", selectedCardIds);
    if (error) {
      setNotice(error);
      return;
    }
    setGame(playDaifugoCards(game, "you", selectedCardIds));
    setSelectedCardIds([]);
    setNotice("");
  };

  const pass = () => {
    if (!game || !canPassDaifugoTurn(game, "you")) return;
    setGame(passDaifugoTurn(game, "you"));
    setSelectedCardIds([]);
    setNotice("");
  };

  if (!game) return <main className="grid min-h-screen place-items-center bg-slate-950 text-white"><p className="font-bold">カードを配っています…</p></main>;
  const humanHand = sortDaifugoHand(game.hands.you);
  const humanTurn = game.currentPlayerId === "you" && game.status === "playing";
  const humanRank = game.finishOrder.indexOf("you");

  return <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#164e63_0%,#0f172a_44%,#020617_100%)] text-white ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="CPU PRACTICE" title="大富豪・CPU練習">
      <button type="button" className={gameTopBannerActionClass} onClick={startNewGame}>新しいゲーム</button>
      <GameTopMenu>
        <Link href="/games" className={gameTopMenuItemClass} data-menu-close="true">広場へ戻る</Link>
        <button type="button" className={gameTopMenuItemClass} data-menu-close="true" onClick={() => setRulesOpen(true)}>ルール</button>
      </GameTopMenu>
      <GamePlayerMenu id={session?.id} name={session?.name || "ゲスト"} avatarColor={session?.avatarColor || fallbackAvatarColor} avatarImage={session?.avatarImage} />
    </GameTopBanner>

    <div className="mx-auto max-w-6xl px-3 py-5 sm:px-5">
      <DaifugoTable state={game} />

      <section className={`mt-4 rounded-3xl border bg-slate-900/90 p-4 shadow-2xl ${humanTurn ? "border-cyan-300 ring-2 ring-cyan-300/30" : "border-white/10"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Your hand</p><h2 className="text-xl font-black">あなたの手札 <span className="text-sm text-slate-400">{humanHand.length}枚</span></h2></div>
          {humanRank >= 0 && <span className="rounded-full bg-amber-300 px-4 py-2 font-black text-slate-950">{rankNames[humanRank]}</span>}
        </div>
        {humanHand.length > 0 ? <PlayingCardHand cards={humanHand} selectedCardIds={selectedCardIds} disabledCardIds={humanTurn ? undefined : humanHand.map((card) => card.id)} size="sm" label="あなたの手札。出すカードを選択" onCardClick={(card) => toggleCard(card.id)} /> : <p className="my-6 text-center font-bold text-amber-200">手札をすべて出しました</p>}
        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 pt-4">
          <button type="button" disabled={!humanTurn || selectedCardIds.length === 0} onClick={playSelected} className="rounded-xl bg-cyan-400 px-6 py-3 font-black text-slate-950 shadow-lg transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-35">選んだカードを出す</button>
          <button type="button" disabled={!canPassDaifugoTurn(game, "you")} onClick={pass} className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 font-black transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35">パス</button>
        </div>
        {notice && <p className="mt-3 text-center text-sm font-bold text-rose-300" role="alert">{notice}</p>}
      </section>

      {game.status === "finished" && <section className="mt-4 rounded-3xl border border-amber-300/40 bg-amber-100 p-6 text-slate-950 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Result</p><h2 className="mt-1 text-3xl font-black">ゲーム終了</h2>
        <ol className="mt-4 grid gap-2 sm:grid-cols-4">{game.finishOrder.map((playerId, index) => <li key={playerId} className="rounded-xl bg-white px-4 py-3 shadow"><span className="text-xs font-bold text-slate-500">{index + 1}位・{rankNames[index]}</span><p className="font-black">{game.players.find((player) => player.id === playerId)?.name}</p></li>)}</ol>
        <button type="button" onClick={startNewGame} className="mt-5 rounded-xl bg-slate-950 px-6 py-3 font-black text-white">もう一度遊ぶ</button>
      </section>}
    </div>
    <DaifugoRulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
  </main>;
}
