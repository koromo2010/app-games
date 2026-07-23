import type { TahoiyaPlayer, TahoiyaRoom } from "@/lib/tahoiya-types";
import { cyanButtonClass, inputClass, panelClass, subtleButtonClass } from "../wordwolf/styles";

type Props = {
  room: TahoiyaRoom; activePlayer: TahoiyaPlayer | null; isAnswerer: boolean;
  submittedCount: number; definitionTargetCount: number; activePlayerDefinitions: string[]; definitionIndex: number; hasSubmitted: boolean; writingDone: boolean;
  definitionInput: string; polishMessage: string; isPolishing: boolean;
  onDefinitionChange: (value: string) => void; onDefinitionIndexChange: (value: number) => void; onEditSubmitted: () => void; onPolish: () => void;
  onSubmit: () => void;
};

export function TahoiyaWritingPanel(props: Props) {
  const { room } = props;
  return <div className={panelClass}>
    <p className="text-xs font-semibold uppercase text-amber-700">Fake explanation</p><h2 className="text-2xl font-black text-slate-950">偽説明を書く</h2>
    <p className="mt-2 text-sm text-slate-600">偽説明: {props.submittedCount}/{props.definitionTargetCount}</p>
    {props.isAnswerer ? <p className="mt-4 rounded-lg bg-cyan-50 p-3 text-sm font-semibold text-cyan-900">回答者にはお題を表示しません。説明が並ぶまで待ちます。</p> : <>
      {room.playMode === "single-answerer" && room.showRealDefinitionToWriters && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-semibold uppercase text-amber-700">AIが用意した正解情報</p><p className="mt-1 text-lg font-bold text-slate-950">{room.realDefinition}</p>
        {room.reading && <p className="mt-2 text-sm font-semibold text-slate-700">読み: {room.reading}</p>}
        <div className="mt-3 border-t border-amber-200 pt-3 text-xs leading-5 text-slate-600"><p><span className="font-bold text-slate-800">出典・確認情報:</span> {room.topicSourceDetail || room.topicNote}</p>{room.topicNote && room.topicNote !== room.topicSourceDetail && <p><span className="font-bold text-slate-800">選定補足:</span> {room.topicNote}</p>}</div>
        <p className="mt-2 text-xs font-semibold text-amber-800">この説明を参考に、回答者を迷わせる別の説明を作ってください。</p>
      </div>}
      {room.fakeDefinitionsPerPlayer > 1 && <div className="mt-4 grid grid-cols-3 gap-2" aria-label="編集する偽説明">
        {Array.from({ length: room.fakeDefinitionsPerPlayer }, (_, index) => {
          const submitted = Boolean(props.activePlayerDefinitions[index]);
          return <button key={index} type="button" onClick={() => props.onDefinitionIndexChange(index)} className={`rounded-lg border px-3 py-2 text-sm font-black ${props.definitionIndex === index ? "border-cyan-500 bg-cyan-100 text-cyan-950" : "border-slate-300 bg-white text-slate-700"}`}>説明 {index + 1}{submitted ? " ✓" : ""}</button>;
        })}
      </div>}
      {props.hasSubmitted && props.writingDone ? <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">全員の偽説明がそろったため、提出内容は確定しました。</div> : <>
        {props.hasSubmitted && <div className="mt-4 rounded-lg bg-cyan-50 p-3 text-sm font-semibold text-cyan-900"><p>{room.fakeDefinitionsPerPlayer > 1 ? `説明 ${props.definitionIndex + 1} は提出済みです。` : "提出済みです。"}全員が提出するまでは上書きできます。</p><button type="button" onClick={props.onEditSubmitted} className="mt-2 rounded-lg border border-cyan-300 bg-white px-3 py-1.5 text-xs font-bold text-cyan-900">現在の説明を編集する</button></div>}
        <textarea value={props.definitionInput} onChange={(event) => props.onDefinitionChange(event.target.value)} className={`mt-4 min-h-28 resize-y ${inputClass}`} placeholder={room.fakeDefinitionsPerPlayer > 1 ? `偽説明 ${props.definitionIndex + 1} を辞書調で書く` : "辞書に載っていそうな短い説明を書く"} maxLength={240} />
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={props.onPolish} disabled={!props.definitionInput.trim() || props.isPolishing} className={subtleButtonClass}>{props.isPolishing ? "AIで整形中..." : "辞書っぽく整える（AI）"}</button><button onClick={props.onSubmit} disabled={!props.definitionInput.trim() || props.isPolishing} className={cyanButtonClass}>{room.fakeDefinitionsPerPlayer > 1 ? props.hasSubmitted ? `説明 ${props.definitionIndex + 1} を上書き` : `説明 ${props.definitionIndex + 1} を投稿` : props.hasSubmitted ? "偽説明を上書き" : "偽説明を投稿"}</button></div>
        {props.polishMessage && <p className="mt-2 text-xs font-semibold text-slate-600">{props.polishMessage}</p>}
      </>}
    </>}
    <p className="mt-4 text-xs font-semibold text-slate-500">必要な数の偽説明が全員分そろうと、自動で投票へ進みます。</p>
  </div>;
}
