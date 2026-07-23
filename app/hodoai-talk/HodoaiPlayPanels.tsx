import { useEffect, useRef, useState } from "react";
import { GamePhaseTimer } from "@/app/components/GamePhaseTimer";
import { RoomTimeLimitControl } from "@/app/components/RoomTimeLimitControl";
import { WordScaleArrangeBoard } from "./WordScaleArrangeBoard";
import { WordScaleVerticalScale } from "./WordScaleVerticalScale";
import { clueHasNumber, normalizeHodoaiClue, type HodoaiConfig, type HodoaiRoom, type HodoaiRoomAction } from "@/lib/hodoai-talk";
import { synchronizedNow } from "@/lib/server-clock";

type RunAction = (action: HodoaiRoomAction) => Promise<HodoaiRoom | null>;
type Props = { room: HodoaiRoom; playerId: string; isHost: boolean; isSaving: boolean; runAction: RunAction; updateConfig: (updates: Partial<Omit<HodoaiConfig, "debugMode">>) => Promise<void> };

export function HodoaiPlayPanels({ room, playerId, isHost, isSaving, runAction, updateConfig }: Props) {
  const [clueDrafts, setClueDrafts] = useState<Record<string, string>>({});
  const [clueError, setClueError] = useState("");
  const timeoutSubmissionKeyRef = useRef("");
  const ownCards = room.cards.filter((card) => card.ownerId === playerId);
  const sorter = room.players.find((player) => player.id === room.sorterId) ?? null;
  const canArrange = room.phase === "arrange" && room.sorterId === playerId;
  const submittedCount = room.cards.filter((card) => Boolean(room.clues[card.id])).length;
  const submitClues = () => {
    const missingCards = ownCards.filter((card) => !room.clues[card.id]);
    const clues = Object.fromEntries(missingCards.map((card) => [card.id, normalizeHodoaiClue(clueDrafts[card.id] ?? "")]));
    for (const card of missingCards) {
      if (!clues[card.id]) { setClueError(`カード${card.cardNumber}のことばを入力してください。`); return; }
      if (clueHasNumber(clues[card.id])) { setClueError(`カード${card.cardNumber}のことばに数字は使えません。`); return; }
    }
    if (!missingCards.length) return;
    setClueError("");
    void runAction({ type: "submit-clues", actorId: playerId, round: room.round, clues }).then((saved) => {
      if (!saved) { setClueError("提出を保存できませんでした。通信状態を確認して、もう一度お試しください。"); return; }
      setClueDrafts((current) => Object.fromEntries(Object.entries(current).filter(([cardId]) => !clues[cardId])));
    });
  };
  useEffect(() => {
    if (room.phase !== "clue" || !room.phaseStartedAt || room.clueTimeLimitSeconds <= 0) return;
    const missingCards = ownCards.filter((card) => !room.clues[card.id]);
    const clues = Object.fromEntries(missingCards.map((card) => [card.id, normalizeHodoaiClue(clueDrafts[card.id] ?? "")]));
    if (!Object.values(clues).some((clue) => clue && !clueHasNumber(clue))) return;
    const key = `${room.code}:${room.round}:${room.phaseStartedAt}:${playerId}`;
    const delay = Math.max(0, room.phaseStartedAt + room.clueTimeLimitSeconds * 1000 - synchronizedNow());
    const timer = window.setTimeout(() => {
      if (timeoutSubmissionKeyRef.current === key) return;
      timeoutSubmissionKeyRef.current = key;
      void runAction({ type: "submit-timeout-clues", actorId: playerId, round: room.round, clues }).then((saved) => {
        if (!saved) return;
        setClueDrafts((current) => Object.fromEntries(Object.entries(current).filter(([cardId]) => !saved.clues[cardId])));
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [clueDrafts, ownCards, playerId, room, runAction]);
  return <>
    {room.phase === "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">ゲーム開始前</h2>{isHost ? <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">同じカードでことばを出す回数<select value={room.roundsTotal} onChange={(event) => void updateConfig({ roundsTotal: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950">{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}回</option>)}</select></label><label className="text-sm font-bold">1人に配るカード<select value={room.cardsPerPlayer} onChange={(event) => void updateConfig({ cardsPerPlayer: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950">{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}枚</option>)}</select></label><div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50"><span className="block font-black">並べ替え役はランダム</span>ゲーム開始時に参加者から1人を選びます。最後のカード操作と順番の確定は、その人だけが行います。</div><RoomTimeLimitControl label="1回ごとのことば提出時間" value={room.clueTimeLimitSeconds} onChange={(seconds) => void updateConfig({ clueTimeLimitSeconds: seconds })} /><RoomTimeLimitControl label="並べ替え相談時間" value={room.arrangeTimeLimitSeconds} onChange={(seconds) => void updateConfig({ arrangeTimeLimitSeconds: seconds })} /></div> : <p className="mt-4 rounded-xl bg-white/[0.05] p-4 text-slate-300">ホストが設定してゲームを開始するまでお待ちください。並べ替え役はゲーム開始時にランダムで決まります。</p>}{isHost && <button type="button" disabled={isSaving || (room.players.length < 2 && !room.debugMode)} onClick={() => void runAction({ type: "start-game", actorId: playerId })} className="mt-6 w-full rounded-xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950 disabled:opacity-40">{room.players.length < 2 && !room.debugMode ? "2人以上で開始できます" : "このメンバーで開始"}</button>}</section>}
    {room.phase !== "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">{room.phase === "clue" ? `ことば ${room.round}/${room.roundsTotal}回目` : room.phase === "arrange" ? "最終並べ替え" : "最終結果"}</p><h2 className="mt-2 text-2xl font-black sm:text-4xl">{room.phase === "clue" ? room.theme?.title : room.phase === "arrange" ? "すべてのことばを手がかりに並べる" : `${room.totalPoints}/3点`}</h2></div><span className="rounded-xl bg-amber-300 px-4 py-2 font-black text-slate-950">全 {room.cards.length}枚</span></div>{room.phase === "clue" && room.theme && <div className="mt-5 grid gap-4 md:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]"><WordScaleVerticalScale lowLabel={room.theme.lowLabel} highLabel={room.theme.highLabel} markers={ownCards.flatMap((card) => typeof room.values[card.id] === "number" ? [{ id: card.id, label: `あなたのカード${card.cardNumber}`, value: room.values[card.id] }] : [])} /><div className="flex items-center rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-bold leading-7 text-amber-100">0から120へ縦に伸びる同じスケールを、ことば提出から最後の並べ替えまで使います。自分の数字がどの位置かを意識しながら、お題に合うことばを考えてください。</div></div>}</section>}
    {room.phase === "clue" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">同じ数字カードへ新しいことばを出す</h2><p className="mt-1 text-sm text-slate-400">{room.round}回目の提出 {submittedCount}/{room.cards.length}枚</p></div>{room.phaseStartedAt && <GamePhaseTimer key={room.phaseStartedAt} durationSeconds={room.clueTimeLimitSeconds} startedAt={room.phaseStartedAt} label="提出時間" />}</div><p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm font-bold text-amber-100">今回のお題「{room.theme?.title}」に沿った短いことばだけで伝えてください。カードの数字は前回から変わりません。</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{ownCards.map((card) => <div key={card.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><div className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-4 text-center"><p className="text-xs font-bold text-amber-100">あなたのカード {card.cardNumber}</p><p className="mt-1 text-6xl font-black text-amber-300">{room.values[card.id]}</p></div>{room.clueHistory.length > 0 && <div className="mt-3 space-y-1">{room.clueHistory.map((clueRound) => <p key={clueRound.round} className="text-xs text-slate-300"><span className="font-bold text-cyan-200">{clueRound.round}回目：</span>{clueRound.clues[card.id]}</p>)}</div>}{room.clues[card.id] ? <div className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3"><p className="font-black text-emerald-100">提出済み：{room.clues[card.id]}</p></div> : <label className="mt-3 block text-sm font-bold">今回、このカードを表すことば<input value={clueDrafts[card.id] ?? ""} maxLength={40} onChange={(event) => { setClueError(""); setClueDrafts((current) => ({ ...current, [card.id]: event.target.value })); }} className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-lg text-white outline-none focus:border-amber-300" /><span className="mt-1 block text-xs font-normal text-slate-400">1〜40文字・数字は使用不可</span></label>}</div>)}</div>{clueError && <p role="alert" className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{clueError}</p>}{ownCards.some((card) => !room.clues[card.id]) && <button type="button" disabled={isSaving} onClick={submitClues} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">{ownCards.filter((card) => !room.clues[card.id]).length}枚のことばをまとめて提出</button>}<p className="mt-4 text-center text-sm text-slate-300">自分の全カードを一度に提出します。全員分がそろうと次のお題へ進み、最後の回だけ並べ替えへ進みます。</p></section>}
    {room.phase === "arrange" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">全カードを小さい順に並べる</h2><p className="mt-1 text-sm text-slate-400">並べ替え役：<span className="font-black text-cyan-200">{sorter?.name ?? "未定"}</span>{canArrange ? "（あなた）" : ""}</p></div>{room.phaseStartedAt && <GamePhaseTimer key={room.phaseStartedAt} durationSeconds={room.arrangeTimeLimitSeconds} startedAt={room.phaseStartedAt} label="相談時間" />}</div><div className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="今回使ったお題">{room.clueHistory.map((clueRound) => <div key={clueRound.round} className="rounded-xl border border-white/10 bg-white/[0.05] p-3"><p className="text-xs font-black text-amber-300">{clueRound.round}回目のお題</p><p className="mt-1 font-black text-white">{clueRound.theme.title}</p><p className="mt-1 text-xs text-slate-400">0側：{clueRound.theme.lowLabel} ／ 120側：{clueRound.theme.highLabel}</p></div>)}</div><WordScaleArrangeBoard order={room.order} cards={room.cards} players={room.players} clueRounds={room.clueHistory} values={room.values} viewerId={playerId} revealAllValues={room.debugMode && isHost} canArrange={canArrange} disabled={isSaving} onReorder={(order) => runAction({ type: "reorder", actorId: playerId, round: room.round, order }).then(Boolean)} />{canArrange ? <button type="button" disabled={isSaving} onClick={() => void runAction({ type: "score-round", actorId: playerId, round: room.round })} className="mt-3 w-full rounded-xl bg-fuchsia-400 px-4 py-3 font-black text-fuchsia-950 disabled:opacity-50">この順番で確定して数字を公開する</button> : <p className="mt-3 rounded-xl bg-white/[0.05] p-3 text-center text-sm font-bold text-slate-300">{sorter?.name ?? "並べ替え役"}が順番を確定すると数字が公開されます。</p>}</section>}
  </>;
}
