import Link from "next/link";
import type { RoomChoice } from "@/lib/wordwolf-game-types";
import { cyanButtonClass, inputClass, panelClass, subtleButtonClass } from "./styles";

type Props = {
  playerName: string;
  roomPassphrase: string;
  joinCode: string;
  joinableRooms: RoomChoice[];
  isJoinListOpen: boolean;
  isPending: boolean;
  onRoomPassphraseChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onShowJoinChoices: () => void;
  onJoinRoom: (code?: string) => void;
};

export function WordWolfEntryPanel({ playerName, roomPassphrase, joinCode, joinableRooms, isJoinListOpen, isPending, onRoomPassphraseChange, onJoinCodeChange, onCreateRoom, onShowJoinChoices, onJoinRoom }: Props) {
  const hasPlayerName = Boolean(playerName.trim());

  return <div className={panelClass}>
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase text-cyan-700">Entry</p><h2 className="text-lg font-bold text-slate-950">部屋</h2></div>
      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">local</span>
    </div>
    {hasPlayerName ? <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm text-cyan-950"><p className="text-xs font-semibold text-cyan-700">プレイヤー</p><p className="mt-0.5 font-bold">{playerName.trim()}</p></div> : <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950"><p className="font-semibold">先にロビーでプレイヤー登録してください。</p><Link href="/games" className="mt-2 inline-flex rounded-lg bg-amber-200 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-100">広場へ</Link></div>}
    <label className="mt-3 block text-sm font-medium text-slate-700">合言葉（任意）<input value={roomPassphrase} onChange={(event) => onRoomPassphraseChange(event.target.value)} className={`mt-1 ${inputClass}`} placeholder="空欄なら合言葉なし" type="password" /></label>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button onClick={onCreateRoom} disabled={!hasPlayerName || isPending} className={cyanButtonClass}>{isPending ? "処理中…" : "部屋を作成"}</button>
      <button onClick={onShowJoinChoices} disabled={!hasPlayerName || isPending} className={subtleButtonClass}>参加</button>
    </div>
    <input value={joinCode} onChange={(event) => onJoinCodeChange(event.target.value.toUpperCase())} className={`mt-2 font-mono uppercase ${inputClass}`} placeholder="ROOM CODE" maxLength={4} />
    {isJoinListOpen && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">参加できる部屋</p><button onClick={onShowJoinChoices} disabled={isPending} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50">更新</button></div>
      <div className="mt-3 space-y-2">
        {joinableRooms.length === 0 ? <p className="rounded-lg bg-white px-3 py-4 text-center text-sm text-slate-500">未開始の部屋はありません。</p> : joinableRooms.map((choice) => <button key={choice.code} onClick={() => onJoinRoom(choice.code)} disabled={isPending} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition hover:border-cyan-400 hover:bg-cyan-50 disabled:opacity-50"><div className="flex items-center justify-between gap-2"><span className="font-mono text-base font-bold">{choice.code}</span><span className="text-xs text-slate-500">{choice.hasPassphrase ? "合言葉あり" : "合言葉なし"}</span></div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600"><span>host: {choice.hostName}</span><span>{choice.playerCount}人</span><span>{choice.roundsTotal}周</span></div></button>)}
      </div>
      {joinCode.trim() && <button onClick={() => onJoinRoom()} disabled={isPending} className={`mt-3 w-full ${subtleButtonClass}`}>入力したコードで参加</button>}
    </div>}
  </div>;
}
