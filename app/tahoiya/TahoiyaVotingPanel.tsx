import type { TahoiyaPlayer, TahoiyaRoom } from "@/lib/tahoiya-types";
import { cyanButtonClass, panelClass, primaryButtonClass, subtleButtonClass } from "../wordwolf/styles";

type Props = { room: TahoiyaRoom; activePlayer: TahoiyaPlayer | null; voteCount: number; voterTarget: number; isAllVoteMode: boolean; isAnswerer: boolean; hasVoted: boolean; votingDone: boolean; displayedOptionId: string; selectedOptionId: string; isHost: boolean; isDebugMode: boolean; onSelect: (id: string) => void; onVote: () => void; onAutoFill: () => void; onAdvance: () => void };

export function TahoiyaVotingPanel(props: Props) {
  const { room } = props;
  return <div className={panelClass}>
    <p className="text-xs font-semibold uppercase text-amber-700">Vote</p><h2 className="text-2xl font-black text-slate-950">{room.playMode === "all-vote" ? "最多得票を決める" : "本物を選ぶ"}</h2><p className="mt-2 text-sm text-slate-600">投票: {props.voteCount}/{props.voterTarget}</p>
    {!props.isAllVoteMode && !props.isAnswerer ? <div className="mt-4 space-y-3"><p className={`rounded-lg p-3 text-sm font-semibold ${props.votingDone ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>{props.votingDone ? "回答者が投票しました。ホストの結果発表を待っています。" : "回答者が候補を見比べています。投票先は結果発表まで非公開です。"}</p><OptionList room={room} /></div> : <div className="mt-4 grid gap-2">
      {props.hasVoted && !props.votingDone && <p className="rounded-lg bg-cyan-50 p-3 text-sm font-semibold text-cyan-900">投票済みです。全員が投票するまでは別の候補へ変更できます。</p>}
      {room.options.map((option, index) => { const own = option.authorId === props.activePlayer?.id; return <button key={option.id} disabled={own} onClick={() => props.onSelect(option.id)} className={`rounded-lg border px-3 py-3 text-left text-sm font-semibold ${own ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : props.displayedOptionId === option.id && props.selectedOptionId ? "border-amber-500 bg-amber-50 text-amber-950" : props.displayedOptionId === option.id ? "border-cyan-500 bg-cyan-50 text-cyan-950" : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-white"}`}>{index + 1}. {option.text}{own ? "（自分の説明）" : props.displayedOptionId === option.id && !props.selectedOptionId ? "（投票済み）" : ""}</button>; })}
      <button onClick={props.onVote} disabled={!props.selectedOptionId || props.votingDone} className={cyanButtonClass}>{props.hasVoted ? "投票を変更" : "投票する"}</button>
    </div>}
    <p className="mt-4 text-xs font-semibold text-slate-500">必要な投票がそろうと、自動で採点して結果を表示します。</p>
    {props.isHost && props.isDebugMode && <div className="mt-3 flex flex-wrap gap-2"><button onClick={props.onAutoFill} className={subtleButtonClass}>未投票をテスト投票</button><button onClick={props.onAdvance} className={primaryButtonClass}>結果へ進む（デバッグ）</button></div>}
  </div>;
}

function OptionList({ room }: { room: TahoiyaRoom }) { return <div className="grid gap-2">{room.options.map((option, index) => <div key={option.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800">{index + 1}. {option.text}</div>)}</div>; }
