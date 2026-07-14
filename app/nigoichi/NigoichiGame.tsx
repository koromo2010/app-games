"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { listLocalWordWolfWords } from "@/lib/wordwolf";

type Phase = "setup" | "pass" | "write" | "reveal" | "deduce" | "result";

const wordPool = listLocalWordWolfWords();

function shuffle<T>(items: readonly T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

function playerLabels(count: number) {
  return Array.from({ length: count }, (_, index) => `プレイヤー${index + 1}`);
}

function createRound(count: number) {
  const words = shuffle(wordPool).slice(0, count * 2 + 1);
  const dealtNumbers = shuffle(Array.from({ length: count * 2 }, (_, index) => index));
  return {
    words,
    hands: Array.from({ length: count }, (_, index) => [dealtNumbers[index * 2], dealtNumbers[index * 2 + 1]] as const),
  };
}

export function NigoichiGame() {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState(() => playerLabels(4));
  const [round, setRound] = useState(() => createRound(4));
  const [phase, setPhase] = useState<Phase>("setup");
  const [activePlayer, setActivePlayer] = useState(0);
  const [clues, setClues] = useState<string[]>(() => Array(4).fill(""));
  const [guesses, setGuesses] = useState<number[]>(() => Array(4).fill(-1));
  const [rulesOpen, setRulesOpen] = useState(false);

  const missingNumber = useMemo(
    () => Array.from({ length: round.words.length }, (_, index) => index).find((index) => !round.hands.flat().includes(index)) ?? -1,
    [round],
  );
  const activeHand = round.hands[activePlayer] ?? [];
  const finishedClues = clues.filter(Boolean).length;
  const correctGuessCount = guesses.filter((guess) => guess === missingNumber).length;

  const resetForCount = (count: number) => {
    setPlayerCount(count);
    setNames(playerLabels(count));
    setRound(createRound(count));
    setClues(Array(count).fill(""));
    setGuesses(Array(count).fill(-1));
    setActivePlayer(0);
    setPhase("setup");
  };

  const startRound = () => {
    setRound(createRound(playerCount));
    setClues(Array(playerCount).fill(""));
    setGuesses(Array(playerCount).fill(-1));
    setActivePlayer(0);
    setPhase("pass");
  };

  const finishWriting = () => {
    if (!clues[activePlayer]?.trim()) return;
    if (activePlayer === playerCount - 1) {
      setPhase("reveal");
      return;
    }
    setActivePlayer((current) => current + 1);
    setPhase("pass");
  };

  const finishGuessing = () => {
    if (guesses.some((guess) => guess < 0)) return;
    setPhase("result");
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fde68a_0,_#f8fafc_34%,_#dbeafe_100%)] px-4 pb-16 pt-6 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-900/10 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
          <div>
            <p className="text-xs font-black tracking-[0.18em] text-slate-500">PRIVATE LOCAL MOCK</p>
            <h1 className="text-2xl font-black tracking-tight">ニゴイチ</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setRulesOpen(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold hover:bg-slate-100">ルール</button>
            <Link href="/games" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-700">ロビーへ</Link>
          </div>
        </header>

        <section className="mt-5 rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm leading-6 shadow-sm">
          <p className="font-black">調整用モック</p>
          <p>同じ端末を順番に渡して試す版です。部屋作成・ログイン・戦績・正式な得点処理はまだ持たせていません。</p>
        </section>

        {phase === "setup" && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <h2 className="text-xl font-black">人数と名前を決める</h2>
            <p className="mt-1 text-sm text-slate-600">人数の2倍+1個の単語を並べ、各人へ重複なしの2番号を配ります。</p>
            <label className="mt-5 block text-sm font-bold">プレイ人数
              <select value={playerCount} onChange={(event) => resetForCount(Number(event.target.value))} className="mt-2 block rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold">
                {[3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}人</option>)}
              </select>
            </label>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {names.map((name, index) => (
                <label key={index} className="text-sm font-bold">プレイヤー{index + 1}
                  <input value={name} maxLength={20} onChange={(event) => setNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
              ))}
            </div>
            <button type="button" onClick={startRound} className="mt-6 rounded-xl bg-indigo-600 px-5 py-3 font-black text-white shadow-sm hover:bg-indigo-500">この人数で配る</button>
          </section>
        )}

        {phase !== "setup" && (
          <>
            <section className="mt-5 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><p className="text-sm font-bold text-slate-500">場の単語</p><h2 className="text-xl font-black">{round.words.length} 枚（{playerCount}人 × 2 + 1）</h2></div>
                <div className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-800">入力済み {finishedClues}/{playerCount}</div>
              </div>
              <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {round.words.map((word, index) => (
                  <li key={`${index}-${word}`} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${phase === "result" && index === missingNumber ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-slate-50"}`}>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-black text-white">{index + 1}</span>
                    <span className="font-bold">{word}</span>
                    {phase === "result" && index === missingNumber && <span className="ml-auto text-xs font-black text-rose-600">余り</span>}
                  </li>
                ))}
              </ol>
            </section>

            {phase === "pass" && (
              <section className="mx-auto mt-5 max-w-xl rounded-2xl border-2 border-indigo-200 bg-indigo-950 p-7 text-center text-white shadow-lg">
                <p className="text-sm font-bold text-indigo-200">画面を {names[activePlayer] || `プレイヤー${activePlayer + 1}`} に渡してください</p>
                <h2 className="mt-2 text-3xl font-black">ほかの人は見ないでね</h2>
                <button type="button" onClick={() => setPhase("write")} className="mt-6 rounded-xl bg-amber-300 px-5 py-3 font-black text-slate-950 hover:bg-amber-200">自分の2枚を見る</button>
              </section>
            )}

            {phase === "write" && (
              <section className="mx-auto mt-5 max-w-2xl rounded-2xl border border-indigo-200 bg-white/95 p-6 shadow-sm">
                <p className="text-sm font-bold text-indigo-700">{names[activePlayer] || `プレイヤー${activePlayer + 1}`} の番</p>
                <h2 className="mt-1 text-2xl font-black">この2つから、ひとつの連想語を書く</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {activeHand.map((number) => <div key={number} className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-4"><span className="text-xs font-black text-indigo-700">番号 {number + 1}</span><p className="mt-1 text-xl font-black">{round.words[number]}</p></div>)}
                </div>
                <label className="mt-5 block text-sm font-bold">みんなに見せる連想語
                  <input value={clues[activePlayer]} maxLength={30} autoFocus onChange={(event) => setClues((current) => current.map((item, index) => index === activePlayer ? event.target.value : item))} placeholder="例：エジプト" className="mt-2 block w-full rounded-xl border border-slate-300 px-4 py-3 text-lg" />
                </label>
                <button type="button" disabled={!clues[activePlayer]?.trim()} onClick={finishWriting} className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">書いて伏せる</button>
              </section>
            )}

            {phase === "reveal" && (
              <section className="mt-5 rounded-2xl border border-emerald-200 bg-white/95 p-5 shadow-sm">
                <p className="text-sm font-bold text-emerald-700">一斉公開</p>
                <h2 className="text-2xl font-black">連想語から、配られていない番号を探す</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {names.map((name, index) => <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-bold text-slate-500">{name || `プレイヤー${index + 1}`}</p><p className="mt-1 text-xl font-black">{clues[index]}</p></div>)}
                </div>
                <button type="button" onClick={() => setPhase("deduce")} className="mt-6 rounded-xl bg-emerald-600 px-5 py-3 font-black text-white hover:bg-emerald-500">各自の予想へ</button>
              </section>
            )}

            {phase === "deduce" && (
              <section className="mt-5 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
                <p className="text-sm font-bold text-violet-700">推理フェーズ（モック）</p>
                <h2 className="text-2xl font-black">配られていない番号はどれ？</h2>
                <p className="mt-1 text-sm text-slate-600">各人が1つずつ選択。正式版のペナルティ・得点配分は、遊んでから決める。</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {names.map((name, playerIndex) => <fieldset key={playerIndex} className="rounded-xl border border-slate-200 p-4"><legend className="px-1 font-black">{name || `プレイヤー${playerIndex + 1}`}</legend><div className="mt-2 flex flex-wrap gap-2">{round.words.map((_, number) => <button key={number} type="button" onClick={() => setGuesses((current) => current.map((guess, index) => index === playerIndex ? number : guess))} className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-black ${guesses[playerIndex] === number ? "border-violet-700 bg-violet-700 text-white" : "border-slate-300 bg-white hover:bg-violet-50"}`}>{number + 1}</button>)}</div></fieldset>)}
                </div>
                <button type="button" disabled={guesses.some((guess) => guess < 0)} onClick={finishGuessing} className="mt-6 rounded-xl bg-violet-700 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">答え合わせ</button>
              </section>
            )}

            {phase === "result" && (
              <section className="mt-5 rounded-2xl border-2 border-rose-200 bg-white/95 p-6 text-center shadow-sm">
                <p className="text-sm font-bold text-rose-600">答え合わせ</p>
                <h2 className="mt-1 text-3xl font-black">余っていたのは {missingNumber + 1} 番「{round.words[missingNumber]}」</h2>
                <p className="mt-3 text-slate-700">{correctGuessCount}人が正解。ここでは番号推理まで確認し、正式版で各プレイヤーの手札公開と得点処理を詰めます。</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{names.map((name, index) => <div key={index} className={`rounded-xl border p-3 ${guesses[index] === missingNumber ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><p className="font-bold">{name || `プレイヤー${index + 1}`}</p><p className="mt-1 text-sm">予想：{guesses[index] + 1}番 {guesses[index] === missingNumber ? "✓" : ""}</p></div>)}</div>
                <button type="button" onClick={startRound} className="mt-6 rounded-xl bg-slate-900 px-5 py-3 font-black text-white hover:bg-slate-700">もう一度配る</button>
              </section>
            )}
          </>
        )}
      </div>

      <GameRulesDialog open={rulesOpen} title="ニゴイチ（モック）の進め方" onClose={() => setRulesOpen(false)}>
        <ol className="list-decimal space-y-2 pl-5"><li>人数の2倍+1個の単語を場に並べ、各プレイヤーへ重複なしの2番号を配ります。</li><li>自分の2単語の両方から連想できる語を1つ書き、全員で公開します。</li><li>連想語を手がかりに、誰にも配られていない1番号を推理します。</li></ol>
        <p className="mt-4 rounded-lg bg-amber-50 p-3 font-bold text-amber-950">この版は操作感確認用。正式な手札公開、得点、ペナルティ、オンライン部屋は未実装です。</p>
      </GameRulesDialog>
    </main>
  );
}
