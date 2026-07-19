import type { TahoiyaRoom } from "@/lib/tahoiya-types";
import { GameFeedbackPanel } from "../components/GameFeedbackPanel";
import { RoomResultActions } from "../components/RoomResultActions";
import { panelClass } from "../wordwolf/styles";
import { submittedDefinitionCount } from "@/lib/tahoiya-room-domain";

type Reason = { value: string; label: string; rating?: "good" | "bad" };
type Props = { room: TahoiyaRoom; playerId: string; reasons: Reason[]; isHost: boolean; canReturn: boolean; isDissolved: boolean; onReturn: () => void; onDissolve?: () => void };

function definitionStyle(room: TahoiyaRoom) {
  const length = Array.from(room.realDefinition.replace(/。$/, "")).length;
  const style = length <= 14 ? "brief" : length <= 25 ? "standard" : length <= 38 ? "detailed" : length <= 46 ? "long" : length <= 55 ? "extended" : "maximum";
  return { length, style };
}

export function TahoiyaResultPanel({ room, playerId, reasons, isHost, canReturn, isDissolved, onReturn, onDissolve }: Props) {
  const definition = definitionStyle(room);
  return <div className={panelClass}>
    <p className="text-xs font-semibold uppercase text-amber-700">Result</p><h2 className="text-3xl font-black text-slate-950">結果</h2>
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold uppercase text-amber-700">本物</p><p className="mt-1 text-lg font-black text-slate-950">{room.realDefinition}</p>{room.reading && <p className="mt-2 text-sm font-semibold text-slate-700">読み: {room.reading}</p>}<div className="mt-3 border-t border-amber-200 pt-3 text-xs leading-5 text-slate-600"><p><span className="font-bold text-slate-800">出典・確認情報:</span> {room.topicSourceDetail || room.topicNote}</p>{room.topicNote && room.topicNote !== room.topicSourceDetail && <p><span className="font-bold text-slate-800">選定補足:</span> {room.topicNote}</p>}{room.topicGeneration && <p><span className="font-bold text-slate-800">生成:</span> {room.topicGeneration.provider} / {room.topicGeneration.model} / {room.topicGeneration.promptVersion}{room.topicGeneration.reusedFromCatalog ? " / 保存済み問題を再利用" : ""}</p>}</div></div>
    <div className="mt-4 grid gap-2">{room.options.map((option, index) => { const author = option.authorId ? room.players.find((player) => player.id === option.authorId) : null; const votes = Object.entries(room.votes).filter(([, id]) => id === option.id).map(([id]) => room.players.find((player) => player.id === id)?.name ?? "Unknown"); return <div key={option.id} className={`rounded-lg border px-3 py-3 text-sm ${option.isReal ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><p className="font-bold text-slate-950">{index + 1}. {option.text}</p><p className="mt-1 text-xs text-slate-500">{option.isReal ? "本物" : `作者: ${author?.name ?? "Unknown"}`} / 投票: {votes.length ? votes.join(", ") : "なし"}</p></div>; })}</div>
    <p className="mt-4 text-sm font-semibold text-slate-700">{room.resultText}</p>
    {room.topicGeneration && playerId && <GameFeedbackPanel artifactId={`tahoiya:${room.code}:${room.round}:${room.word}`} artifactText={`単語=${room.word} / 読み=${room.reading ?? ""} / 語釈=${room.realDefinition} / 注記=${room.topicNote}`} game="tahoiya" task="tahoiya.topic" playerId={playerId} generation={room.topicGeneration} reasonOptions={reasons} settings={{ playerCount: room.players.length, playMode: room.playMode, answererMode: room.answererMode, showRealDefinitionToWriters: room.showRealDefinitionToWriters, fakeDefinitionsPerPlayer: room.fakeDefinitionsPerPlayer, difficulty: room.topicDifficulty, reusedFromCatalog: room.topicGeneration.reusedFromCatalog === true, definitionStyle: definition.style, definitionLength: definition.length, punctuationStyle: "no-parentheses" }} outcome={{ correctVotes: Object.entries(room.votes).filter(([, id]) => room.options.find((option) => option.id === id)?.isReal).length, fakeDefinitionCount: submittedDefinitionCount(room) }} />}
    <RoomResultActions canReturnToRoom={canReturn} isHost={isHost} isRoomDissolved={isDissolved} onReturnToRoom={onReturn} onDissolve={onDissolve} />
  </div>;
}
