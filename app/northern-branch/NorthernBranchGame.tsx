"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { northernBaseResources, northernBuildings, northernCards } from "@/lib/northern-branch-data";
import { applyNorthernAction, createNorthernGame, northernRules } from "@/lib/northern-branch-game";
import type { NorthernGameAction, NorthernGameState } from "@/lib/northern-branch-types";

const storageKey = "northern-branch-private-prototype";

export function NorthernBranchGame() {
  const [playerNames, setPlayerNames] = useState(["プレイヤー1", "プレイヤー2"]);
  const [game, setGame] = useState<NorthernGameState | null>(null);
  const [paymentIndexes, setPaymentIndexes] = useState<number[]>([]);
  const [notice, setNotice] = useState("公開情報をもとにした個人利用向けの仮ルールです。");
  const [handRevealed, setHandRevealed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) setGame(JSON.parse(stored) as NorthernGameState);
      } catch {
        localStorage.removeItem(storageKey);
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready || !game) return;
    localStorage.setItem(storageKey, JSON.stringify(game));
  }, [game, ready]);

  const activePlayer = game?.players[game.activePlayerIndex];
  const selectedValue = activePlayer
    ? paymentIndexes.reduce((sum, index) => sum + (northernCards[activePlayer.hand[index]]?.value ?? 0), 0)
    : 0;

  const perform = (action: NorthernGameAction) => {
    if (!game) return;
    const outcome = applyNorthernAction(game, action);
    setGame(outcome.state);
    setNotice(outcome.notice);
    if (outcome.ok && action.type !== "use-building") setPaymentIndexes([]);
    if (outcome.ok && action.type === "end-turn") setHandRevealed(false);
  };

  const startGame = () => {
    setGame(createNorthernGame(playerNames));
    setPaymentIndexes([]);
    setHandRevealed(false);
    setNotice("ゲームを開始しました。手番の人が手札を表示してください。");
  };

  const resetGame = () => {
    localStorage.removeItem(storageKey);
    setGame(null);
    setPaymentIndexes([]);
    setHandRevealed(false);
    setNotice("新しいゲームを準備できます。");
  };

  if (!ready) {
    return <main className="min-h-screen bg-slate-950 p-8 text-white">保存データを確認中...</main>;
  }

  if (!game) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#365314_0%,#172033_38%,#020617_78%)] px-4 py-8 text-white">
        <div className="mx-auto max-w-3xl">
          <Link href="/games" className="text-sm font-semibold text-lime-200 hover:text-white">← ゲームロビー</Link>
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-lime-300">Private prototype</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">ノーザンブランチ</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              資源を商品へ育て、建物を増やし、最初に10勝利点へ到達した商会が勝利します。
              1台の端末を2～4人で順番に回して、ルールの大枠を試せます。
            </p>
            <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
              商品レシピ、建物名、費用、効果は検証用の仮データです。市販品の完全再現ではありません。
            </div>
            <div className="mt-6 space-y-3">
              {playerNames.map((name, index) => (
                <label key={`player-name-${index}`} className="block text-sm font-semibold text-slate-200">
                  プレイヤー {index + 1}
                  <input
                    value={name}
                    maxLength={20}
                    onChange={(event) => setPlayerNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                    className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-lime-300"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={playerNames.length >= 4} onClick={() => setPlayerNames((names) => [...names, `プレイヤー${names.length + 1}`])} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold disabled:opacity-40">プレイヤー追加</button>
              <button type="button" disabled={playerNames.length <= 2} onClick={() => setPlayerNames((names) => names.slice(0, -1))} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold disabled:opacity-40">1人減らす</button>
            </div>
            <button type="button" onClick={startGame} className="mt-6 w-full rounded-xl bg-lime-400 px-4 py-3 font-black text-lime-950 transition hover:bg-lime-300">このメンバーで始める</button>
          </div>
        </div>
      </main>
    );
  }

  const winner = game.players.find((player) => player.id === game.winnerId);
  if (!activePlayer) return <main className="min-h-screen bg-slate-950 p-8 text-white">ゲームデータを読み込めませんでした。</main>;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-[linear-gradient(120deg,#0f172a,#1a2e05,#422006)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5">
          <div>
            <Link href="/games" className="text-xs font-bold text-lime-200 hover:text-white">← ゲームロビー</Link>
            <h1 className="mt-1 text-2xl font-black">ノーザンブランチ <span className="text-sm text-amber-200">仮ルール版</span></h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-lg bg-white/10 px-3 py-2">巡目 {game.turn}</span>
            <button type="button" onClick={resetGame} className="rounded-lg border border-white/15 px-3 py-2 font-semibold hover:bg-white/10">最初から</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="space-y-3">
          <section className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-xs font-bold uppercase text-lime-300">Players</p>
            <div className="mt-3 space-y-2">
              {game.players.map((player, index) => (
                <div key={player.id} className={`rounded-lg border p-3 ${index === game.activePlayerIndex ? "border-lime-300 bg-lime-300/10" : "border-white/10 bg-black/10"}`}>
                  <div className="flex items-center justify-between gap-2"><p className="truncate font-bold">{player.name}</p><p className="font-black text-amber-300">{player.points}点</p></div>
                  <p className="mt-1 text-xs text-slate-400">手札 {player.hand.length}/{northernRules.handLimit}・建物 {player.buildings.length}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.06] p-4 text-sm">
            <p className="font-bold text-lime-300">ターンの流れ</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-300"><li>市場を確認</li><li>通常アクションを1回</li><li>建物を各1回まで使用</li><li>手番を終了</li></ol>
          </section>
        </aside>

        <div className="space-y-4">
          <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${notice.includes("不足") || notice.includes("必要") || notice.includes("でき") ? "border-rose-300/40 bg-rose-300/10 text-rose-100" : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"}`}>{notice}</div>
          {winner && <div className="rounded-2xl border border-amber-300 bg-amber-300/15 p-6 text-center"><p className="text-sm font-bold text-amber-200">GAME FINISHED</p><p className="mt-2 text-3xl font-black">{winner.name}の勝利！</p></div>}

          <section className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase text-cyan-300">Market</p><h2 className="text-xl font-black">市場の商品と建物</h2></div><p className="text-xs text-slate-400">生産は素材払い／売買は選択した手札の価値払い</p></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {game.offers.map((offer) => {
                const item = offer.kind === "product" ? northernCards[offer.cardId] : northernBuildings[offer.buildingId];
                const cost = offer.kind === "product" ? northernCards[offer.cardId].value : northernBuildings[offer.buildingId].cost;
                const recipe = offer.kind === "product" ? Object.entries(northernCards[offer.cardId].recipe ?? {}).map(([id, count]) => `${northernCards[id as keyof typeof northernCards].name}×${count}`).join("＋") : "";
                return <article key={offer.id} className="rounded-xl border border-white/10 bg-slate-900 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-slate-400">{offer.kind === "product" ? "商品" : "建物"}</p><h3 className="font-black">{item.name}</h3></div><span className="rounded-md bg-amber-300 px-2 py-1 text-xs font-black text-amber-950">価値 {cost}</span></div>{offer.kind === "product" ? <p className="mt-2 min-h-10 text-xs text-slate-300">生産：{recipe}</p> : <p className="mt-2 min-h-10 text-xs text-slate-300">{northernBuildings[offer.buildingId].description} / {northernBuildings[offer.buildingId].points}点</p>}<div className="mt-3 flex gap-2">{offer.kind === "product" && <button type="button" disabled={game.mainActionUsed || game.status === "finished"} onClick={() => perform({ type: "produce", offerId: offer.id })} className="flex-1 rounded-lg bg-cyan-600 px-2 py-2 text-xs font-bold disabled:opacity-30">生産</button>}<button type="button" disabled={game.mainActionUsed || game.status === "finished"} onClick={() => perform({ type: "buy", offerId: offer.id, paymentIndexes })} className="flex-1 rounded-lg bg-amber-500 px-2 py-2 text-xs font-bold text-amber-950 disabled:opacity-30">売買</button></div></article>;
              })}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-lime-300">Main action</p><h2 className="text-xl font-black">資源を1枚得る</h2></div><span className={`rounded-lg px-3 py-2 text-xs font-bold ${game.mainActionUsed ? "bg-slate-700 text-slate-300" : "bg-lime-300 text-lime-950"}`}>{game.mainActionUsed ? "使用済み" : "選択可能"}</span></div>
            <div className="mt-4 flex flex-wrap gap-2">
              {northernBaseResources.map((cardId) => <button key={cardId} type="button" disabled={game.mainActionUsed || game.status === "finished"} onClick={() => perform({ type: "take-resource", cardId })} className={`rounded-lg px-3 py-2 text-sm font-black disabled:opacity-30 ${northernCards[cardId].color}`}>{northernCards[cardId].name}</button>)}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-amber-300">Private hand</p><h2 className="text-xl font-black">{activePlayer.name}の手札</h2></div>{handRevealed && <p className="text-sm font-bold text-amber-200">選択価値 {selectedValue}</p>}</div>
            {!handRevealed ? (
              <button type="button" onClick={() => setHandRevealed(true)} className="mt-4 w-full rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-8 font-black text-amber-100">周りに見えないように手札を表示</button>
            ) : (
              <>
                <p className="mt-3 text-xs text-slate-400">売買に使うカードを選択してください。ダングは価値−1です。</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activePlayer.hand.map((cardId, index) => {
                    const card = northernCards[cardId];
                    const selected = paymentIndexes.includes(index);
                    return <button key={`${cardId}-${index}`} type="button" aria-pressed={selected} onClick={() => setPaymentIndexes((current) => selected ? current.filter((item) => item !== index) : [...current, index])} className={`min-w-24 rounded-xl border p-3 text-left transition ${selected ? "border-cyan-300 ring-2 ring-cyan-300/40" : "border-white/10"} ${card.color}`}><span className="block text-xs font-bold opacity-70">{card.kind}</span><span className="block font-black">{card.name}</span><span className="block text-xs font-bold">価値 {card.value}</span></button>;
                  })}
                </div>
                <button type="button" onClick={() => setHandRevealed(false)} className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold">手札を隠す</button>
              </>
            )}
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <div><p className="text-xs font-bold uppercase text-violet-300">Brownie actions</p><h2 className="text-xl font-black">建物</h2></div>
            {activePlayer.buildings.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{activePlayer.buildings.map((buildingId) => { const building = northernBuildings[buildingId]; const used = activePlayer.usedBuildings.includes(buildingId); return <article key={buildingId} className="rounded-xl border border-white/10 bg-slate-900 p-3"><div className="flex items-start justify-between gap-2"><h3 className="font-black">{building.name}</h3><span className="text-sm font-black text-amber-300">{building.points}点</span></div><p className="mt-2 min-h-10 text-xs text-slate-300">{building.description}</p><button type="button" disabled={used || game.status === "finished"} onClick={() => perform({ type: "use-building", buildingId })} className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold disabled:bg-slate-700 disabled:text-slate-400">{used ? "使用済み" : building.actionLabel}</button></article>; })}</div> : <p className="mt-3 rounded-lg bg-black/20 p-4 text-sm text-slate-400">まだ建物がありません。市場から売買で建てましょう。</p>}
          </section>

          <button type="button" disabled={!game.mainActionUsed || game.status === "finished"} onClick={() => perform({ type: "end-turn" })} className="w-full rounded-xl bg-lime-400 px-4 py-4 text-lg font-black text-lime-950 transition hover:bg-lime-300 disabled:bg-slate-700 disabled:text-slate-400">手番を終了して端末を渡す</button>
        </div>

        <aside className="space-y-3">
          <section className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-xs font-bold uppercase text-amber-300">Goal</p><p className="mt-1 text-3xl font-black">先に10点</p><p className="mt-2 text-xs leading-5 text-slate-400">建物の得点と、交易所・商人ギルドの商売で勝利点を増やします。</p>
          </section>
          <section className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <p className="font-black">行動履歴</p><ul className="mt-3 space-y-2">{game.log.slice(0, 12).map((entry, index) => <li key={`${entry}-${index}`} className="border-b border-white/5 pb-2 text-xs leading-5 text-slate-300">{entry}</li>)}</ul>
          </section>
          <section className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100"><p className="font-black">試作上の注意</p><p className="mt-1">数値とカード構成は仮設定です。ブラウザー内に自動保存されますが、ネット対戦にはまだ対応していません。</p></section>
        </aside>
      </div>
    </main>
  );
}
