"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  clueHasNumber,
  countHodoaiInversions,
  createHodoaiRound,
  hodoaiFinalMessage,
  pointsForInversions,
  type HodoaiGameState,
} from "@/lib/hodoai-talk";

const storageKey = "hodoai-talk-private-prototype-v1";

function Scale({ low, high }: { low: string; high: string }) {
  return (
    <div>
      <div className="h-2 rounded-full bg-gradient-to-r from-sky-400 via-amber-300 to-fuchsia-400" />
      <div className="mt-2 flex justify-between gap-4 text-xs font-bold text-slate-300">
        <span>0｜{low}</span><span className="text-right">{high}｜120</span>
      </div>
    </div>
  );
}

export function HodoaiTalkGame() {
  const [names, setNames] = useState(["プレイヤー1", "プレイヤー2", "プレイヤー3"]);
  const [game, setGame] = useState<HodoaiGameState | null>(null);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [clue, setClue] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) setGame(JSON.parse(stored) as HodoaiGameState);
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

  const orderedPlayers = useMemo(() => {
    if (!game) return [];
    return game.order.flatMap((id) => {
      const player = game.players.find((candidate) => candidate.id === id);
      return player ? [player] : [];
    });
  }, [game]);

  const currentPlayer = game?.players[game.cluePlayerIndex];

  const startGame = () => {
    const cleanNames = names.map((name, index) => name.trim() || `プレイヤー${index + 1}`);
    setGame(createHodoaiRound(cleanNames));
    setRevealed(false);
    setClue("");
    setNotice("");
  };

  const resetGame = () => {
    localStorage.removeItem(storageKey);
    setGame(null);
    setRevealed(false);
    setClue("");
    setNotice("");
  };

  const submitClue = () => {
    const cleanClue = clue.trim();
    if (!game || !currentPlayer || cleanClue.length < 2) {
      setNotice("ヒントを2文字以上で入力してください。");
      return;
    }
    if (clueHasNumber(cleanClue)) {
      setNotice("数字そのものはヒントに使えません。言葉だけで表現してください。");
      return;
    }
    const isLast = game.cluePlayerIndex === game.players.length - 1;
    setGame({
      ...game,
      players: game.players.map((player) => player.id === currentPlayer.id ? { ...player, clue: cleanClue } : player),
      cluePlayerIndex: isLast ? game.cluePlayerIndex : game.cluePlayerIndex + 1,
      phase: isLast ? "arrange" : "clue",
    });
    setClue("");
    setRevealed(false);
    setNotice(isLast ? "全員のヒントがそろいました。相談して順番を決めましょう。" : "画面を隠して、次の人へ端末を渡してください。");
  };

  const moveClue = (index: number, direction: -1 | 1) => {
    if (!game) return;
    const target = index + direction;
    if (target < 0 || target >= game.order.length) return;
    const order = [...game.order];
    [order[index], order[target]] = [order[target], order[index]];
    setGame({ ...game, order });
  };

  const revealResult = () => {
    if (!game) return;
    const inversions = countHodoaiInversions(game);
    const points = pointsForInversions(inversions);
    const result = { round: game.round, theme: game.theme, inversions, points };
    setGame({ ...game, phase: "result", totalPoints: game.totalPoints + points, history: [...game.history, result] });
    setNotice(inversions === 0 ? "完全一致！ 見事な並びです。" : `前後が入れ替わった組み合わせは${inversions}組でした。`);
  };

  const continueGame = () => {
    if (!game) return;
    if (game.round >= 3) {
      setGame({ ...game, phase: "finished" });
      return;
    }
    setGame(createHodoaiRound(game.players.map((player) => player.name), game.round + 1, game.totalPoints, game.history));
    setRevealed(false);
    setClue("");
    setNotice("新しいお題です。最初の人へ端末を渡してください。");
  };

  if (!ready) return <main className="min-h-screen bg-slate-950 p-8 text-white">保存データを確認中...</main>;

  if (!game) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#164e63_0%,#1e293b_42%,#020617_82%)] px-4 py-8 text-white">
        <div className="mx-auto max-w-3xl">
          <Link href="/games" className="text-sm font-bold text-cyan-200 hover:text-white">← ゲームロビー</Link>
          <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/75 shadow-2xl backdrop-blur">
            <div className="bg-gradient-to-r from-sky-400 via-amber-300 to-fuchsia-400 px-6 py-8 text-slate-950">
              <p className="text-xs font-black uppercase tracking-[0.28em]">Private original prototype</p>
              <h1 className="mt-2 text-4xl font-black sm:text-6xl">ほどあいトーク</h1>
              <p className="mt-3 max-w-xl font-bold leading-7">見えない目盛りを言葉で伝え、みんなの感覚を低い順に並べる協力ゲーム。</p>
            </div>
            <div className="p-6">
              <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50">
                独自の名称・お題・採点方式で作った個人利用向け試作です。市販ゲームの画像、文章、固有モードは使用していません。
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {["① 数字をこっそり確認", "② 言葉のヒントを出す", "③ 全員で並べて採点"].map((item) => <div key={item} className="rounded-xl bg-white/[0.06] p-3 text-sm font-bold">{item}</div>)}
              </div>
              <div className="mt-6 space-y-3">
                {names.map((name, index) => (
                  <label key={`name-${index}`} className="block text-sm font-bold text-slate-200">
                    プレイヤー {index + 1}
                    <input value={name} maxLength={20} onChange={(event) => setNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-cyan-300" />
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={names.length >= 8} onClick={() => setNames((current) => [...current, `プレイヤー${current.length + 1}`])} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold disabled:opacity-40">プレイヤー追加</button>
                <button type="button" disabled={names.length <= 2} onClick={() => setNames((current) => current.slice(0, -1))} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold disabled:opacity-40">1人減らす</button>
              </div>
              <button type="button" onClick={startGame} className="mt-6 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 hover:bg-amber-200">3ラウンド始める</button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0e7490_0%,#172033_35%,#020617_75%)] px-4 py-6 text-white">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div><Link href="/games" className="text-xs font-bold text-cyan-200 hover:text-white">← ゲームロビー</Link><h1 className="mt-1 text-2xl font-black">ほどあいトーク</h1></div>
          <div className="flex gap-2 text-sm font-bold"><span className="rounded-lg bg-white/10 px-3 py-2">{Math.min(game.round, 3)} / 3 ラウンド</span><span className="rounded-lg bg-amber-300 px-3 py-2 text-slate-950">合計 {game.totalPoints}点</span><button type="button" onClick={resetGame} className="rounded-lg border border-white/15 px-3 py-2">最初から</button></div>
        </header>

        <section className="mt-5 rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl sm:p-8">
          {game.phase !== "finished" && <><p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">今回のものさし</p><h2 className="mt-2 text-2xl font-black sm:text-4xl">{game.theme.title}</h2><div className="mt-5"><Scale low={game.theme.lowLabel} high={game.theme.highLabel} /></div></>}
          {notice && <div className="mt-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-3 text-sm font-bold text-cyan-50">{notice}</div>}

          {game.phase === "clue" && currentPlayer && (
            <div className="mt-7">
              {!revealed ? (
                <div className="text-center"><p className="text-lg font-black">{currentPlayer.name}さんの番</p><p className="mt-2 text-sm text-slate-400">ほかの人は画面を見ないでください。</p><button type="button" onClick={() => { setRevealed(true); setNotice(""); }} className="mt-5 w-full rounded-2xl bg-cyan-400 px-4 py-8 text-xl font-black text-cyan-950">自分の目盛りを見る</button></div>
              ) : (
                <div><div className="rounded-2xl border border-amber-300/40 bg-amber-300/10 p-6 text-center"><p className="text-sm font-bold text-amber-100">あなたの目盛り</p><p className="mt-2 text-7xl font-black text-amber-300">{currentPlayer.value}</p><p className="mt-2 text-xs text-slate-300">この位置らしいものを、数字を使わず表現しよう</p></div><label className="mt-5 block text-sm font-bold">言葉のヒント<input autoFocus value={clue} maxLength={40} onChange={(event) => setClue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitClue(); }} placeholder="例：雨上がりの公園" className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-lg text-white outline-none placeholder:text-slate-500 focus:border-amber-300" /></label><button type="button" onClick={submitClue} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950">ヒントを決めて画面を隠す</button></div>
              )}
            </div>
          )}

          {game.phase === "arrange" && (
            <div className="mt-7"><div className="flex items-end justify-between gap-3"><div><p className="font-black">低そうなヒントから並べる</p><p className="mt-1 text-sm text-slate-400">相談は自由。矢印で順番を動かしてください。</p></div><span className="text-xs font-bold text-slate-400">上＝0側</span></div><ol className="mt-4 space-y-2">{orderedPlayers.map((player, index) => <li key={player.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3"><span className="w-7 text-center text-sm font-black text-cyan-300">{index + 1}</span><span className="min-w-0 flex-1 font-black">{player.clue}</span><div className="flex gap-1"><button type="button" aria-label={`${player.clue}を上へ`} disabled={index === 0} onClick={() => moveClue(index, -1)} className="rounded-lg border border-white/15 px-3 py-2 disabled:opacity-25">↑</button><button type="button" aria-label={`${player.clue}を下へ`} disabled={index === orderedPlayers.length - 1} onClick={() => moveClue(index, 1)} className="rounded-lg border border-white/15 px-3 py-2 disabled:opacity-25">↓</button></div></li>)}</ol><button type="button" onClick={revealResult} className="mt-5 w-full rounded-xl bg-fuchsia-400 px-4 py-3 font-black text-fuchsia-950">この順番で答えを見る</button></div>
          )}

          {game.phase === "result" && (
            <div className="mt-7"><div className="grid gap-2">{orderedPlayers.map((player, index) => <div key={player.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3"><span className="text-center text-sm font-black text-cyan-300">{index + 1}</span><div><p className="font-black">{player.clue}</p><p className="text-xs text-slate-400">{player.name}</p></div><span className="text-2xl font-black text-amber-300">{player.value}</span></div>)}</div><div className="mt-5 rounded-2xl bg-gradient-to-r from-cyan-400 to-amber-300 p-5 text-center text-slate-950"><p className="text-sm font-black">このラウンド</p><p className="mt-1 text-5xl font-black">+{game.history.at(-1)?.points ?? 0}点</p><p className="mt-2 text-sm font-bold">並び違い {game.history.at(-1)?.inversions ?? 0}組</p></div><button type="button" onClick={continueGame} className="mt-5 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950">{game.round >= 3 ? "最終結果へ" : "次のラウンドへ"}</button></div>
          )}

          {game.phase === "finished" && (
            <div className="py-8 text-center"><p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Game finished</p><h2 className="mt-3 text-3xl font-black">3ラウンド合計</h2><p className="mt-3 text-8xl font-black text-amber-300">{game.totalPoints}<span className="text-2xl"> / 9点</span></p><p className="mx-auto mt-5 max-w-lg text-lg font-bold leading-8 text-slate-200">{hodoaiFinalMessage(game.totalPoints)}</p><div className="mx-auto mt-7 grid max-w-lg gap-2 sm:grid-cols-3">{game.history.map((result) => <div key={result.round} className="rounded-xl bg-white/[0.06] p-3"><p className="text-xs text-slate-400">第{result.round}ラウンド</p><p className="mt-1 text-2xl font-black text-amber-300">{result.points}点</p></div>)}</div><button type="button" onClick={resetGame} className="mt-7 rounded-xl bg-cyan-400 px-8 py-3 font-black text-cyan-950">もう一度遊ぶ</button></div>
          )}
        </section>

        <p className="mt-4 text-center text-xs leading-5 text-slate-400">採点：並び違い 0組＝3点 / 1組＝2点 / 2～3組＝1点 / 4組以上＝0点。ネット対戦には未対応です。</p>
      </div>
    </main>
  );
}
