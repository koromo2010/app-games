"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { DebugModeButton } from "@/app/components/DebugModeButton";
import { DebugToolButton, DebugToolsSection } from "@/app/components/DebugGameTools";
import { DebugWordGenerationTest } from "@/app/components/DebugWordGenerationTest";
import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GameLoungeVisual } from "@/app/components/GameLoungeVisual";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { GamePhaseTimer } from "@/app/components/GamePhaseTimer";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { OnlineRoomSpectatorLink } from "@/app/components/OnlineRoomSpectatorLink";
import { PageLoadingOverlay } from "@/app/components/PageLoadingOverlay";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import { RoomResultActions } from "@/app/components/RoomResultActions";
import { RoomLobbyReturnStatus } from "@/app/components/RoomLobbyReturnStatus";
import { RoomTimeLimitControl } from "@/app/components/RoomTimeLimitControl";
import {
  codeInterceptClueHistory,
  codeLengthForTeam,
  codeInterceptPhaseTimeLimitSeconds,
  codeInterceptMaximumCardCount,
  codeInterceptMinimumCardCount,
  codeInterceptMinimumPlayers,
  codeInterceptPlayerLimit,
  codeInterceptRoomIsStartable,
  codeInterceptShareText,
  codeInterceptTeamIds,
  codeInterceptWordDifficulties,
  isValidCodeInterceptAnswer,
  normalizeCodeInterceptCodeLength,
  otherCodeInterceptTeam,
  teamPlayers,
  type CodeInterceptPlayer,
  type CodeInterceptRoom,
  type CodeInterceptTeamId,
  type CodeInterceptTeamRoundResult,
  type CodeInterceptWordDifficulty,
} from "@/lib/code-intercept";
import { allRoomPlayersReturned } from "@/lib/room-lobby-return";
import { defaultAvatarImage, fallbackAvatarColor } from "@/lib/player-session";
import type { CodeInterceptController } from "./use-code-intercept-controller";

function teamLabel(teamId: CodeInterceptTeamId) { return teamId === "red" ? "赤チーム" : "青チーム"; }
function codeRevealLabel(room: Pick<CodeInterceptRoom, "codeRevealMode">) { return room.codeRevealMode === "all" ? "全員に公開" : "自チームだけ"; }
function timeLimitLabel(seconds: number) { return seconds > 0 ? `${seconds}秒` : "なし"; }
function wordDifficultyLabel(difficulty: CodeInterceptWordDifficulty) {
  return difficulty === "easy" ? "簡単" : difficulty === "hard" ? "難しい" : "普通";
}
function wordDifficultyMixLabel(difficulty: CodeInterceptWordDifficulty) {
  if (difficulty === "easy") return "簡単100%";
  if (difficulty === "hard") return "難しい50%・普通40%・簡単10%";
  return "普通80%・簡単20%";
}
function teamStyle(teamId: CodeInterceptTeamId) {
  return teamId === "red"
    ? "border-rose-300/35 bg-rose-300/10 text-rose-50"
    : "border-sky-300/35 bg-sky-300/10 text-sky-50";
}
function CodePicker({ value, cardCount, codeLength, disabled, onChange }: { value: number[]; cardCount: number; codeLength: number; disabled?: boolean; onChange: (value: number[]) => void }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: codeLength }, (_, index) => <label key={index} className="text-xs font-bold text-slate-300">{index + 1}桁目
    <select value={value[index] ?? ""} disabled={disabled} onChange={(event) => { const next = [...value]; next[index] = Number(event.target.value); onChange(next); }} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-800 px-3 py-3 text-center text-lg font-black text-white">
      <option value="">―</option>
      {Array.from({ length: cardCount }, (_, number) => number + 1).map((number) => <option key={number} value={number} disabled={value.some((item, itemIndex) => itemIndex !== index && item === number)}>{number}</option>)}
    </select>
  </label>)}</div>;
}

function AnswerProposalList({ room, answererIds, proposals }: { room: CodeInterceptRoom; answererIds: string[]; proposals: Record<string, number[]> }) {
  if (answererIds.length < 2) return null;
  return <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/35 p-3">
    <p className="text-xs font-black text-slate-300">チーム内の回答案</p>
    <ul className="mt-2 space-y-1 text-sm">{answererIds.map((answererId) => <li key={answererId} className="flex items-center justify-between gap-3"><span>{room.players.find((player) => player.id === answererId)?.name ?? "回答者"}</span><strong className="font-mono">{proposals[answererId]?.join("・") ?? "検討中"}</strong></li>)}</ul>
    <p className="mt-2 text-xs leading-5 text-slate-400">全員の案が一致すると自動で確定します。不一致なら案を更新できます。</p>
  </div>;
}

function PhaseTimer({ room }: { room: CodeInterceptRoom }) {
  const durationSeconds = codeInterceptPhaseTimeLimitSeconds(room);
  return room.phaseStartedAt && durationSeconds > 0
    ? <GamePhaseTimer key={room.phaseStartedAt} durationSeconds={durationSeconds} startedAt={room.phaseStartedAt} label="制限時間" />
    : null;
}

function AnswerEditor({ title, room, answererIds, proposals, submittedAnswer, draft, codeLength, saving, canRevise, submitLabel, resubmitLabel, buttonClass, onChange, onSubmit }: {
  title: string;
  room: CodeInterceptRoom;
  answererIds: string[];
  proposals: Record<string, number[]>;
  submittedAnswer?: number[];
  draft: number[];
  codeLength: number;
  saving: boolean;
  canRevise: boolean;
  submitLabel: string;
  resubmitLabel: string;
  buttonClass: string;
  onChange: (value: number[]) => void;
  onSubmit: () => void;
}) {
  const editable = !submittedAnswer || canRevise;
  return <>
    <h3 className="font-black">{title}</h3>
    {submittedAnswer && <p className="mt-3 font-mono text-2xl font-black text-emerald-200">確定済み {submittedAnswer.join("・")}</p>}
    {editable ? <>
      {submittedAnswer && <p className="mt-2 text-xs text-slate-300">相手チームが回答を完了するまでは変更できます。</p>}
      <div className="mt-3"><CodePicker value={draft} cardCount={room.cardCount} codeLength={codeLength} onChange={onChange} /></div>
      <AnswerProposalList room={room} answererIds={answererIds} proposals={proposals} />
      <button type="button" disabled={saving || !isValidCodeInterceptAnswer(draft, room.cardCount, codeLength)} onClick={onSubmit} className={`mt-3 w-full rounded-xl px-4 py-3 font-black disabled:opacity-40 ${buttonClass}`}>{submittedAnswer ? resubmitLabel : submitLabel}</button>
    </> : <p className="mt-2 text-xs text-slate-300">相手チームが回答を完了したため、この回答は確定しました。</p>}
  </>;
}

function PlayerCard({ player, room, me }: { player: CodeInterceptPlayer; room: CodeInterceptRoom; me: string }) {
  const isMe = player.id === me;
  return <li className={`flex items-center gap-3 rounded-xl border p-3 ${teamStyle(player.teamId)}`}>
    <span className="h-9 w-9 shrink-0 rounded-full border border-white/40 bg-cover bg-center" style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }} />
    <span className="min-w-0 flex-1 truncate font-bold">{player.name}{isMe ? "（あなた）" : ""}</span>
    {player.isDummy && <span className="rounded bg-cyan-100 px-2 py-1 text-xs font-black text-cyan-950">ダミー</span>}
    {player.id === room.hostId && <span className="rounded bg-amber-300 px-2 py-1 text-xs font-black text-slate-950">ホスト</span>}
  </li>;
}

function ManualTeamEditor({ room, me, saving, onTeamChange }: { room: CodeInterceptRoom; me: string; saving: boolean; onTeamChange: (playerId: string, teamId: CodeInterceptTeamId) => void }) {
  return <section className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-4">
    <h3 className="font-black">手動チーム編成</h3>
    <p className="mt-1 text-xs leading-5 text-slate-400">ホストは全員を編成できます。参加者は自分のチームだけ変更できます。</p>
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">{room.players.map((player) => {
      const editable = room.hostId === me || player.id === me;
      return <li key={player.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{player.name}{player.id === me ? "（あなた）" : ""}</span>
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/15">
          {codeInterceptTeamIds.map((teamId) => <button key={teamId} type="button" aria-pressed={player.teamId === teamId} disabled={saving || !editable || player.teamId === teamId} onClick={() => onTeamChange(player.id, teamId)} className={`px-3 py-2 text-xs font-black disabled:cursor-default ${player.teamId === teamId ? teamId === "red" ? "bg-rose-300 text-slate-950" : "bg-sky-300 text-slate-950" : "bg-slate-800 text-slate-200 disabled:opacity-40"}`}>{teamId === "red" ? "赤" : "青"}</button>)}
        </div>
      </li>;
    })}</ul>
  </section>;
}

function ResultCard({ result, room }: { result: CodeInterceptTeamRoundResult; room: CodeInterceptRoom }) {
  const enemy = otherCodeInterceptTeam(result.teamId);
  return <article className={`rounded-2xl border p-5 ${teamStyle(result.teamId)}`}>
    <div className="flex items-center justify-between"><h3 className="text-xl font-black">{teamLabel(result.teamId)}</h3><span className="font-mono text-xl font-black">{result.pointsBefore} → {result.pointsAfter}点</span></div>
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-slate-400">正解暗号</dt><dd className="font-mono font-black">{result.secretCode.length > 0 ? result.secretCode.join("・") : "相手には非公開"}</dd>
      <dt className="text-slate-400">今回の桁数</dt><dd className="font-black">{result.codeLength}桁</dd>
      <dt className="text-slate-400">ヒント</dt><dd className="font-black">{result.clues.join("／")}</dd>
      <dt className="text-slate-400">味方回答</dt><dd>{result.allyAnswer?.join("・") ?? (result.secretCode.length === 0 ? "相手には非公開" : "未回答")} <strong className={result.allyCorrect ? "text-emerald-200" : "text-rose-200"}>{result.allyCorrect ? "伝達成功" : result.miscommunicationDamage > 0 ? `伝達失敗 −${result.miscommunicationDamage}` : "未回答・減点なし"}</strong></dd>
      <dt className="text-slate-400">{teamLabel(enemy)}の傍受</dt><dd>{result.enemyInterceptAnswer?.join("・") ?? (room.roundNumber === 1 ? "第1ラウンドはなし" : "未回答")} {room.roundNumber >= 2 && <strong className={result.enemyIntercepted ? "text-rose-200" : "text-emerald-200"}>{result.enemyIntercepted ? `傍受成功 −${result.interceptionDamage}` : "傍受回避"}</strong>}</dd>
      {result.timeoutDamage > 0 && <><dt className="text-slate-400">時間切れ</dt><dd className="font-black text-rose-200">−{result.timeoutDamage}</dd></>}
      <dt className="font-bold">今回のダメージ</dt><dd className="font-black text-rose-200">−{result.totalDamage}</dd>
    </dl>
  </article>;
}

function NumberedClueHistory({ room, teamId }: { room: CodeInterceptRoom; teamId: CodeInterceptTeamId }) {
  const { numbered, unknown } = codeInterceptClueHistory(room, teamId);
  const canShowHistory = unknown.length > 0 || numbered.some((column) => column.clues.length > 0);
  if (!canShowHistory) return <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-300">正解暗号が非公開のため、相手チームのヒントは番号別に並べません。</p>;
  const columns = [...numbered.map((column) => ({ ...column, label: String(column.cardNumber) })), { cardNumber: "unknown", label: "不明", clues: unknown }];
  return <div className="mt-4 grid gap-2 sm:grid-cols-2">{columns.map((column) => <section key={column.cardNumber} className={`grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] overflow-hidden rounded-xl border ${column.cardNumber === "unknown" ? "border-amber-300/30 bg-amber-300/[0.06] sm:col-span-2" : "border-white/15 bg-slate-950/45"}`}>
      <h4 className="flex items-center justify-center border-r border-white/15 bg-white/10 px-1 py-2 text-center font-mono text-xl font-black">{column.label}</h4>
      <ul className="flex min-h-14 min-w-0 flex-wrap content-center gap-1.5 p-2">{column.clues.length > 0 ? column.clues.map((entry, index) => <li key={`${entry.roundNumber}:${index}:${entry.clue}`} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-white/[0.07] px-2 py-1.5 text-sm"><span className="shrink-0 font-mono text-[11px] text-slate-400">R{entry.roundNumber}</span><strong className="break-words">{entry.clue}</strong></li>) : <li className="text-sm text-slate-400">まだなし</li>}</ul>
    </section>)}</div>;
}

function TeamRoundHistoryTable({ room, teamId }: { room: CodeInterceptRoom; teamId: CodeInterceptTeamId }) {
  return <section className={`rounded-2xl border p-4 ${teamStyle(teamId)}`}>
    <h3 className="text-lg font-black">{teamLabel(teamId)}の過去ログ</h3>
    <p className="mt-1 text-sm text-slate-300">伝達成功したヒントだけ番号別にまとめ、伝達失敗したヒントは「不明」へ残します。</p>
    <NumberedClueHistory room={room} teamId={teamId} />
    <details className="mt-4 rounded-xl border border-white/10 bg-slate-950/25">
      <summary className="cursor-pointer px-3 py-3 font-black">ラウンド結果（{room.roundHistory.length}件）</summary>
      <div className="overflow-x-auto border-t border-white/10"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-white/15 text-slate-300"><th className="px-2 py-2">R</th><th className="px-2 py-2">桁数</th><th className="px-2 py-2">ヒント</th><th className="px-2 py-2">味方回答</th><th className="px-2 py-2">傍受回答</th><th className="px-2 py-2">傍受結果</th></tr></thead><tbody>{room.roundHistory.map((round) => {
      const result = round.teams.find((team) => team.teamId === teamId);
      if (!result) return null;
      return <tr key={`${round.roundNumber}:${teamId}`} className="border-b border-white/[0.07]"><td className="px-2 py-3 font-mono">{round.roundNumber}</td><td className="px-2 py-3 font-black">{result.codeLength}</td><td className="px-2 py-3">{result.clues.join("・")}</td><td className="px-2 py-3 font-mono font-black">{result.allyAnswer?.join("・") ?? (result.secretCode.length === 0 ? "非公開" : "―")}</td><td className="px-2 py-3 font-mono">{result.enemyInterceptAnswer?.join("・") ?? "―"}</td><td className="px-2 py-3">{round.roundNumber < room.interceptionStartsAtRound ? "傍受なし" : result.enemyIntercepted ? "傍受成功" : "傍受失敗"}</td></tr>;
      })}</tbody></table></div>
    </details>
  </section>;
}

function TeamScoreBoard({ room }: { room: CodeInterceptRoom }) {
  return <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
    <h2 className="text-sm font-black text-slate-300">現在のポイント</h2>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">{codeInterceptTeamIds.map((teamId) => {
      const team = room.teams.find((candidate) => candidate.id === teamId);
      return <div key={teamId} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-3 sm:px-4 ${teamStyle(teamId)}`}><span className="text-sm font-black sm:text-base">{teamLabel(teamId)}</span><strong className="whitespace-nowrap font-mono text-lg sm:text-xl">残り {team?.points ?? 0}点</strong></div>;
    })}</div>
  </section>;
}

function SecretWordGrid({ team }: { team: CodeInterceptRoom["teams"][number] }) {
  return <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{team.secretWords.map((word, index) => <div key={`${index}:${word}`} className="rounded-xl border border-white/15 bg-slate-950/50 p-3 text-center"><p className="font-mono text-xs text-slate-300">{index + 1}</p><p className="mt-1 text-lg font-black">{word}</p></div>)}</div>;
}

function RevealedSecretCards({ room }: { room: CodeInterceptRoom }) {
  return <section className="rounded-2xl border border-amber-300/30 bg-slate-950/80 p-5">
    <p className="text-xs font-black tracking-[0.2em] text-amber-300">SECRET CARDS REVEALED</p>
    <h2 className="mt-1 text-xl font-black">両チームの秘密カード</h2>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">{codeInterceptTeamIds.map((teamId) => {
      const team = room.teams.find((candidate) => candidate.id === teamId)!;
      return <article key={teamId} className={`rounded-2xl border p-4 ${teamStyle(teamId)}`}><h3 className="font-black">{teamLabel(teamId)}</h3><SecretWordGrid team={team} /></article>;
    })}</div>
  </section>;
}


export function CodeInterceptDesktopLayout({ controller }: { controller: CodeInterceptController }) {
  const { state, setters, viewModel, permissions, actions, result: resultReturnGate } = controller;
  const {
    room, session, ready, isRestoringRoom, error, passphrase, joinCode, choices,
    showChoices, newPlayerCapacity, isSaving, rulesOpen,
  } = state;
  const {
    playerId, myTeamId, myTeam, myCode, myCodeLength,
    enemyCodeLength, enemyAnswersSubmitted, myAnswererIds,
    latestRound, teamCounts, draftRound, clueDrafts, allyDraft, interceptDraft,
  } = viewModel;
  const { isHost, isClueGiver } = permissions;
  const {
    setPassphrase, setJoinCode, setNewPlayerCapacity, setClueDraftsByRound,
    setAllyDraftsByRound, setInterceptDraftsByRound, setRulesOpen,
  } = setters;
  const {
    runAction, createRoom, joinRoom, listRooms, leaveRoom, dissolveRoom,
    returnToRoom, sampleDebugWords,
  } = actions;

  const rulesDialog = <GameRulesDialog open={rulesOpen} title="コードインターセプトのルール" onClose={() => setRulesOpen(false)}>
    <p>4人以上で赤と青の2チームに分かれて遊びます。味方には暗号を正しく伝えつつ、敵チームがどの番号を伝えているのかも当てるゲームです。</p>
    <h3 className="mt-4 font-black text-white">秘密の単語と暗号</h3>
    <div className="mt-2 space-y-2 text-slate-300">
      <p>各チームは「1：猫、2：宇宙、3：寿司、4：雨」のような、番号つきの秘密単語を持ちます。この組み合わせは同じチームの人にだけ見えます。秘密カードは部屋設定で2〜8枚にできます。</p>
      <p>秘密単語は共通一般プールから選びます。ホストは簡単・普通・難しいの3段階から選べます。</p>
      <p>各ラウンドの出題者には、「3・1・4」のような暗号が表示されます。出題者は、数字を直接書かず、対応する単語のヒントを暗号と同じ順番に書きます。</p>
      <p className="rounded-lg bg-amber-300/10 p-3"><strong className="text-amber-100">例：</strong>上の秘密単語で暗号が「3・1・4」なら、「しょうゆ・肉球・かさ」と伝えられます。</p>
    </div>
    <h3 className="mt-4 font-black text-white">チーム編成</h3>
    <p className="mt-2 text-slate-300">ロビーで決めたチームを使う「手動」と、ゲーム開始時に人数差1人以内で振り分ける「開始時ランダム」から選べます。ランダムではチーム内の出題順もシャッフルされます。</p>
    <h3 className="mt-4 font-black text-white">秘密単語の難易度</h3>
    <p className="mt-2 text-slate-300">簡単は簡単100%、普通は普通80%＋簡単20%、難しいは難しい50%＋普通40%＋簡単10%でGeneral Word Poolから抽選します。</p>
    <h3 className="mt-4 font-black text-white">暗号の桁数</h3>
    <div className="mt-2 space-y-2 text-slate-300">
      <p><strong className="text-white">固定モード</strong>では、両チームが全ラウンドで同じ桁数を使います。</p>
      <p><strong className="text-white">毎ラウンド選択モード</strong>では、そのラウンドの出題者が2桁から秘密カード数までの中から選びます。両チームが決めるまで相手の選択は見えず、確定後に同時公開されます。</p>
      <p>短い暗号は味方へ伝えやすい一方、敵にも完全一致で当てられやすくなります。長い暗号は当てられにくい一方、味方が間違える可能性と、敵へ残すヒントが増えます。</p>
    </div>
    <h3 className="mt-4 font-black text-white">ラウンドの流れ</h3>
    <ol className="mt-2 list-decimal space-y-2 pl-5">
      <li>毎ラウンド選択モードでは、赤・青の出題者がそれぞれ自チームの桁数を選びます。両方が確定した後に暗号を生成します。</li>
      <li>赤・青それぞれの出題者が、表示された暗号に合わせて、同じ数のヒントを書きます。</li>
      <li>両チームが書き終わると、ヒントを同時に公開します。</li>
      <li>出題者以外の味方が相談して、自分たちの暗号を1つ回答します。</li>
      <li>第2ラウンドからは、敵のヒントと過去ログを見て、敵の暗号もチームで1つ回答します。第1ラウンドは敵の情報が少ないため、傍受回答はありません。</li>
      <li>全回答が決まったら結果とダメージを同時に発表します。正解暗号は部屋設定に従って全員、または自チームだけへ表示します。出題者はラウンドごとにチーム内で交代します。</li>
    </ol>
    <h3 className="mt-4 font-black text-white">ポイントとダメージ</h3>
    <div className="mt-2 space-y-2 text-slate-300">
      <p>各チームは<strong className="text-white">5ポイント</strong>から始めます。このポイントは得点というより、チームの残り体力です。</p>
      <p>味方が自分たちの暗号を間違えるか、回答しなかった場合は<strong className="text-white">自チームに1ダメージ</strong>です。</p>
      <p>敵に自分たちの暗号を当てられた場合は、<strong className="text-white">自チームに2ダメージ</strong>です。</p>
      <p>両方が同じラウンドで起きると合計3ダメージです。たとえば残り5ポイントなら、5−1−2で残り2ポイントになります。</p>
    </div>
    <h3 className="mt-4 font-black text-white">勝ち負け</h3>
    <p className="mt-2">両チームのダメージを同時に反映します。片方だけ0ポイント以下になったら、残ったチームの勝ちです。両チームが同時に0ポイント以下になった場合は、マイナス幅が小さいチームの勝ちです。同じポイントなら引き分けです。</p>
    <h3 className="mt-4 font-black text-white">過去ログと時間制限</h3>
    <p className="mt-2">終了したラウンドのヒントは過去ログで確認できます。正解暗号は部屋設定が「全員に公開」の場合だけ相手にも表示され、「自チームだけ」では相手の正解暗号と味方回答を伏せます。敵の秘密単語そのものは、ゲームが終わるまで見えません。時間制限は、出題・ヒント作成とソナー選択で別々に設定できます。</p>
  </GameRulesDialog>;

  if (!ready) return <PageLoadingOverlay />;
  if (!session?.id) return <main className="min-h-screen bg-slate-950 px-4 py-12 text-white"><div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center"><h1 className="text-3xl font-black">コードインターセプト</h1><p className="mt-4 text-slate-300">このゲームはログインしたプレイヤー同士で遊びます。</p><Link href="/games" className="mt-6 inline-flex rounded-xl bg-amber-300 px-5 py-3 font-black text-slate-950">広場へ</Link></div><GameAdSlot gameId="code-intercept" surface="game-entry" /></main>;

  if (!room) return <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#7f1d1d_0%,#172033_42%,#020617_82%)] px-4 pb-8 text-white ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="PRIVATE TEAM PROTOTYPE" title="コードインターセプト"><Link href="/games" className={gameTopBannerActionClass}>広場へ戻る</Link><GameTopMenu><button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button></GameTopMenu><GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} /></GameTopBanner>
    <div className="mx-auto max-w-4xl pt-6"><GameLoungeVisual gameId="code-intercept" /></div>
    <section className="mx-auto mt-6 max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl">
      <div className="bg-gradient-to-r from-rose-300 via-amber-200 to-sky-300 px-6 py-8 text-slate-950"><p className="text-xs font-black tracking-[0.25em]">CODE INTERCEPT</p><h1 className="mt-2 text-4xl font-black sm:text-6xl">コードインターセプト</h1><p className="mt-3 font-bold">味方には伝え、敵の暗号は傍受せよ。</p></div>
      {isRestoringRoom && <p className="border-b border-amber-300/20 bg-amber-300/10 px-6 py-3 text-sm font-bold text-amber-100">前回の部屋を確認中です。画面は先に表示しています。</p>}
      <div inert={isRestoringRoom} aria-busy={isRestoringRoom} className={`grid gap-6 p-6 md:grid-cols-2 ${isRestoringRoom ? "opacity-60" : ""}`}>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋を作る</h2><label className="mt-4 block text-sm font-bold">最大募集人数<select value={newPlayerCapacity} onChange={(event) => setNewPlayerCapacity(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-800 px-3 py-2 text-white">{Array.from({ length: codeInterceptPlayerLimit - codeInterceptMinimumPlayers + 1 }, (_, index) => index + codeInterceptMinimumPlayers).map((count) => <option key={count} value={count}>{count}人</option>)}</select></label><label className="mt-4 block text-sm font-bold">合言葉（任意）<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2" /></label><button type="button" disabled={isSaving} onClick={() => void createRoom()} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">新しい部屋を作る</button></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋に参加</h2><label className="mt-4 block text-sm font-bold">部屋コード<input value={joinCode} maxLength={4} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-lg uppercase" /></label><label className="mt-3 block text-sm font-bold">合言葉<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2" /></label><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={isSaving} onClick={() => void joinRoom()} className="rounded-xl bg-sky-300 px-3 py-3 font-black text-sky-950">コードで参加</button><button type="button" onClick={() => void listRooms()} className="rounded-xl border border-white/20 px-3 py-3 font-black">部屋一覧</button></div></div>
      </div>
      {showChoices && <div className="border-t border-white/10 p-6"><h2 className="font-black">参加できる部屋</h2>{choices.length === 0 ? <p className="mt-3 text-sm text-slate-400">現在参加できる部屋はありません。</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{choices.map((choice) => <button key={choice.code} type="button" onClick={() => void joinRoom(choice.code)} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 text-left"><span className="font-mono text-lg font-black text-amber-200">{choice.code}</span><span className="ml-3 font-bold">{choice.hostName}</span><span className="mt-1 block text-xs text-slate-400">{choice.playerCount}/{choice.playerCapacity}人・赤{choice.redCount}／青{choice.blueCount}・{wordDifficultyLabel(choice.wordDifficulty)}・合言葉{choice.hasPassphrase ? "あり" : "なし"}</span></button>)}</div>}</div>}
      {error && <p className="mx-6 mb-6 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
    </section><GameAdSlot gameId="code-intercept" surface="game-entry" />{rulesDialog}
  </main>;

  return <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#7f1d1d_0%,#172033_38%,#020617_78%)] text-white ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="CODE INTERCEPT" title={<>コードインターセプト <span className="font-mono text-base text-amber-300">#{room.code}</span></>}>
      {room.phase === "lobby" && (isHost ? <button type="button" onClick={() => void dissolveRoom()} className={gameTopBannerDangerActionClass}>部屋を解散</button> : <Link href="/games" className={gameTopBannerActionClass}>広場へ戻る</Link>)}
      <GameTopMenu>{room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>広場へ戻る</Link>}<OnlineRoomSpectatorLink game="code-intercept" code={room.code} /><button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button>{room.phase === "lobby" && !isHost && <button type="button" data-menu-close="true" onClick={() => void leaveRoom()} className={gameTopMenuItemClass}>退出</button>}</GameTopMenu>
      {isHost && <DebugModeButton
        variant="banner"
        enabled={room.debugMode}
        disabled={isSaving || room.phase !== "lobby"}
        onAbort={room.debugMode && room.phase !== "lobby" ? () => runAction({ type: "abort-game", actorId: playerId }).then(() => undefined) : undefined}
        replayEnabled={room.debugReplayEnabled}
        replayDisabled={isSaving}
        onReplayChange={(enabled) => runAction({ type: "set-debug-replay", actorId: playerId, enabled }).then(() => undefined)}
        debugLogEntries={room.debugLog}
        onChange={(enabled) => runAction({ type: "set-debug", actorId: playerId, enabled }).then(() => undefined)}
        gameTools={<DebugToolsSection title="ゲーム操作" description="現在のフェーズで使える一括入力を表示します。">
          {room.phase === "lobby" && <DebugToolButton disabled={isSaving || room.players.length >= room.playerCapacity} onClick={() => void runAction({ type: "debug-add-player", actorId: playerId })}>ダミーを追加</DebugToolButton>}
          {room.phase === "code-length" && <DebugToolButton disabled={isSaving} onClick={() => void runAction({ type: "debug-fill-code-lengths", actorId: playerId })}>未選択の桁数を自動入力</DebugToolButton>}
          {room.phase === "clue" && <DebugToolButton disabled={isSaving} onClick={() => void runAction({ type: "debug-fill-clues", actorId: playerId })}>ヒントを自動入力</DebugToolButton>}
          {room.phase === "answer" && <DebugToolButton disabled={isSaving} onClick={() => void runAction({ type: "debug-fill-answers", actorId: playerId })}>未回答を正解で埋める</DebugToolButton>}
        </DebugToolsSection>}
        wordGenerationTools={room.phase === "lobby"
          ? <DebugWordGenerationTest onGenerate={() => sampleDebugWords(room.code)} heading="秘密カード候補10語を抽出" description="現在の本番抽選条件で、共通DBから秘密カード候補を10語だけ確認します。ゲーム状態や履歴は変更しません。" showModeToggle={false} fixedButtonLabel="候補10語を抽出" fixedRepeatLabel="別の10語を抽出" />
          : undefined}
      />}
      <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
    </GameTopBanner>
    {rulesDialog}<GameAdSlot gameId="code-intercept" surface={room.phase === "lobby" ? "room-lobby" : room.phase === "game-result" ? "result" : null} disabled={room.debugMode} />
    {room.phase === "lobby" && <div className="mx-auto max-w-7xl px-4 pt-4"><GameLoungeVisual gameId="code-intercept" /></div>}
    <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-4"><section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between"><h2 className="font-black">参加者</h2><span className="text-sm text-slate-400">{room.players.length}/{room.playerCapacity}人</span></div><ul className="mt-3 space-y-2">{room.players.map((player) => <PlayerCard key={player.id} player={player} room={room} me={playerId} />)}</ul><RoomLobbyReturnStatus state={room.lobbyReturn} players={room.players} hostId={room.hostId} isHost={isHost} onRemoveWaitingPlayer={(player) => { if (window.confirm(`${player.name}さんを退出扱いにしますか？`)) void runAction({ type: "remove-waiting-player", actorId: playerId, targetPlayerId: player.id }); }} /></section>
        <RoomConfigSummary items={[{ label: "チーム編成", value: room.teamAssignmentMode === "random" ? "開始時ランダム" : "手動" }, { label: "単語難易度", value: `${wordDifficultyLabel(room.wordDifficulty)}（${wordDifficultyMixLabel(room.wordDifficulty)}）` }, { label: "秘密カード C", value: `${room.cardCount}枚` }, { label: "暗号桁数", value: room.codeLengthMode === "fixed" ? `固定・${room.fixedCodeLength}桁` : "毎ラウンド選択" }, { label: "正解暗号", value: codeRevealLabel(room) }, { label: "初期ポイント X", value: `${room.initialPoints}点` }, { label: "伝達失敗", value: `−${room.miscommunicationDamage}` }, { label: "傍受成功", value: `−${room.interceptionDamage}` }, { label: "出題欄に空欄", value: "−1" }, { label: "全欄入力済み", value: "自動提出・減点なし" }, { label: "回答未提出", value: "減点なし" }, { label: "傍受開始", value: "第2ラウンド" }, { label: "出題・ヒント", value: timeLimitLabel(room.clueTimeLimitSeconds) }, { label: "ソナー選択", value: timeLimitLabel(room.answerTimeLimitSeconds) }]} />
      </aside>
      <div className="space-y-4">
        {error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
        {room.phase === "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6">
          <h2 className="text-2xl font-black">チーム分け</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">{room.teamAssignmentMode === "random" ? "4人以上で開始できます。現在のチーム表示はゲーム開始時にランダムで組み直されます。" : "各チーム2人以上、人数差1人以内で開始できます。下の赤・青ボタンでチームを編成してください。"}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{codeInterceptTeamIds.map((teamId) => <div key={teamId} className={`rounded-xl border p-4 ${teamStyle(teamId)}`}><h3 className="text-lg font-black">{teamLabel(teamId)} <span className="font-mono">{teamCounts[teamId]}人</span></h3><p className="mt-2 text-sm">{teamPlayers(room, teamId).map((player) => player.name).join("・") || "未所属"}</p></div>)}</div>
          {room.teamAssignmentMode === "manual" && <ManualTeamEditor room={room} me={playerId} saving={isSaving} onTeamChange={(targetId, teamId) => void runAction({ type: "set-team", actorId: playerId, playerId: targetId, teamId })} />}
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-lg font-black">ゲーム設定</h3>
            <fieldset className="mt-4" disabled={!isHost || isSaving}>
              <legend className="text-sm font-black">チーム編成</legend>
              <label className={`mt-2 block cursor-pointer rounded-xl border p-4 ${room.teamAssignmentMode === "manual" ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-slate-950/40"}`}><span className="flex items-center gap-2 font-black"><input type="radio" name="team-assignment-mode" checked={room.teamAssignmentMode === "manual"} onChange={() => void runAction({ type: "set-config", actorId: playerId, cardCount: room.cardCount, teamAssignmentMode: "manual", codeLengthMode: room.codeLengthMode, codeRevealMode: room.codeRevealMode, fixedCodeLength: room.fixedCodeLength, clueTimeLimitSeconds: room.clueTimeLimitSeconds, answerTimeLimitSeconds: room.answerTimeLimitSeconds })} />手動</span><span className="mt-1 block text-sm text-slate-300">ロビーで決めた赤・青チームのまま開始します。</span></label>
              <label className={`mt-3 block cursor-pointer rounded-xl border p-4 ${room.teamAssignmentMode === "random" ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-slate-950/40"}`}><span className="flex items-center gap-2 font-black"><input type="radio" name="team-assignment-mode" checked={room.teamAssignmentMode === "random"} onChange={() => void runAction({ type: "set-config", actorId: playerId, cardCount: room.cardCount, teamAssignmentMode: "random", codeLengthMode: room.codeLengthMode, codeRevealMode: room.codeRevealMode, fixedCodeLength: room.fixedCodeLength, clueTimeLimitSeconds: room.clueTimeLimitSeconds, answerTimeLimitSeconds: room.answerTimeLimitSeconds })} />開始時にランダム</span><span className="mt-1 block text-sm text-slate-300">人数差1人以内でチームと出題順をシャッフルします。</span></label>
            </fieldset>
            <fieldset className="mt-5" disabled={!isHost || isSaving}>
              <legend className="text-sm font-black">秘密単語の難易度</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {codeInterceptWordDifficulties.map((difficulty) => <label key={difficulty} className={`cursor-pointer rounded-xl border p-4 ${room.wordDifficulty === difficulty ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-slate-950/40"}`}>
                  <span className="flex items-center gap-2 font-black"><input type="radio" name="word-difficulty" checked={room.wordDifficulty === difficulty} onChange={() => void runAction({ type: "set-config", actorId: playerId, cardCount: room.cardCount, wordDifficulty: difficulty, teamAssignmentMode: room.teamAssignmentMode, codeLengthMode: room.codeLengthMode, codeRevealMode: room.codeRevealMode, fixedCodeLength: room.fixedCodeLength, clueTimeLimitSeconds: room.clueTimeLimitSeconds, answerTimeLimitSeconds: room.answerTimeLimitSeconds })} />{wordDifficultyLabel(difficulty)}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-300">{wordDifficultyMixLabel(difficulty)}</span>
                </label>)}
              </div>
            </fieldset>
            <label className="mt-4 block text-sm font-bold">秘密カード数
              <select value={room.cardCount} disabled={!isHost || isSaving} onChange={(event) => { const cardCount = Number(event.target.value); void runAction({ type: "set-config", actorId: playerId, cardCount, teamAssignmentMode: room.teamAssignmentMode, codeLengthMode: room.codeLengthMode, codeRevealMode: room.codeRevealMode, fixedCodeLength: normalizeCodeInterceptCodeLength(room.fixedCodeLength, cardCount), clueTimeLimitSeconds: room.clueTimeLimitSeconds, answerTimeLimitSeconds: room.answerTimeLimitSeconds }); }} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-800 px-3 py-3 text-white disabled:opacity-60">
                {Array.from({ length: codeInterceptMaximumCardCount - codeInterceptMinimumCardCount + 1 }, (_, index) => index + codeInterceptMinimumCardCount).map((count) => <option key={count} value={count}>{count}枚</option>)}
              </select>
            </label>
            <fieldset className="mt-5" disabled={!isHost || isSaving}>
              <legend className="text-sm font-black">暗号の桁数</legend>
              <label className={`mt-2 block cursor-pointer rounded-xl border p-4 ${room.codeLengthMode === "fixed" ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-slate-950/40"}`}><span className="flex items-center gap-2 font-black"><input type="radio" name="code-length-mode" checked={room.codeLengthMode === "fixed"} onChange={() => void runAction({ type: "set-config", actorId: playerId, cardCount: room.cardCount, teamAssignmentMode: room.teamAssignmentMode, codeLengthMode: "fixed", codeRevealMode: room.codeRevealMode, fixedCodeLength: room.fixedCodeLength, clueTimeLimitSeconds: room.clueTimeLimitSeconds, answerTimeLimitSeconds: room.answerTimeLimitSeconds })} />固定</span><span className="mt-1 block text-sm text-slate-300">全ラウンドで両チームが同じ桁数を使います。</span></label>
              {room.codeLengthMode === "fixed" && <label className="mt-3 block text-sm font-bold">固定桁数<select value={room.fixedCodeLength} onChange={(event) => void runAction({ type: "set-config", actorId: playerId, cardCount: room.cardCount, teamAssignmentMode: room.teamAssignmentMode, codeLengthMode: "fixed", codeRevealMode: room.codeRevealMode, fixedCodeLength: Number(event.target.value), clueTimeLimitSeconds: room.clueTimeLimitSeconds, answerTimeLimitSeconds: room.answerTimeLimitSeconds })} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-800 px-3 py-3 text-white">{Array.from({ length: room.cardCount - 1 }, (_, index) => index + 2).map((length) => <option key={length} value={length}>{length}桁</option>)}</select></label>}
              <label className={`mt-3 block cursor-pointer rounded-xl border p-4 ${room.codeLengthMode === "per-round" ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-slate-950/40"}`}><span className="flex items-center gap-2 font-black"><input type="radio" name="code-length-mode" checked={room.codeLengthMode === "per-round"} onChange={() => void runAction({ type: "set-config", actorId: playerId, cardCount: room.cardCount, teamAssignmentMode: room.teamAssignmentMode, codeLengthMode: "per-round", codeRevealMode: room.codeRevealMode, clueTimeLimitSeconds: room.clueTimeLimitSeconds, answerTimeLimitSeconds: room.answerTimeLimitSeconds })} />毎ラウンド選択</span><span className="mt-1 block text-sm text-slate-300">各チームの出題者が、そのラウンドに使う桁数を決めます。</span></label>
            </fieldset>
            <fieldset className="mt-5 rounded-xl bg-white p-4 text-slate-950" disabled={!isHost || isSaving}>
              <div className="grid gap-4 sm:grid-cols-2">
                <RoomTimeLimitControl label="出題・ヒント作成時間" value={room.clueTimeLimitSeconds} onChange={(seconds) => void runAction({ type: "set-config", actorId: playerId, cardCount: room.cardCount, teamAssignmentMode: room.teamAssignmentMode, codeLengthMode: room.codeLengthMode, codeRevealMode: room.codeRevealMode, fixedCodeLength: room.fixedCodeLength, clueTimeLimitSeconds: seconds, answerTimeLimitSeconds: room.answerTimeLimitSeconds })} />
                <RoomTimeLimitControl label="ソナー選択時間" value={room.answerTimeLimitSeconds} onChange={(seconds) => void runAction({ type: "set-config", actorId: playerId, cardCount: room.cardCount, teamAssignmentMode: room.teamAssignmentMode, codeLengthMode: room.codeLengthMode, codeRevealMode: room.codeRevealMode, fixedCodeLength: room.fixedCodeLength, clueTimeLimitSeconds: room.clueTimeLimitSeconds, answerTimeLimitSeconds: seconds })} />
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">出題・ヒント作成時間は、毎ラウンド選択時の桁数決定とヒント作成でそれぞれ最初からカウントします。0秒時に全ヒント欄が埋まっていれば自動提出して減点なし、空欄があれば書いた内容を残して1点減点します。回答側の未提出は減点なしです。</p>
            </fieldset>
            {room.codeLengthMode === "per-round" && <p className="mt-4 rounded-xl bg-cyan-300/10 p-3 text-sm leading-6 text-cyan-100">短い暗号は味方に伝えやすい一方、敵にも当てられやすくなります。長い暗号は傍受されにくい一方、多くのヒントが敵に残ります。</p>}
            <fieldset className="mt-5" disabled={!isHost || isSaving}>
              <legend className="text-sm font-black">ラウンド後の正解暗号</legend>
              <label className={`mt-2 block cursor-pointer rounded-xl border p-4 ${room.codeRevealMode === "all" ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-slate-950/40"}`}><span className="flex items-center gap-2 font-black"><input type="radio" name="code-reveal-mode" checked={room.codeRevealMode === "all"} onChange={() => void runAction({ type: "set-config", actorId: playerId, cardCount: room.cardCount, teamAssignmentMode: room.teamAssignmentMode, codeLengthMode: room.codeLengthMode, codeRevealMode: "all", fixedCodeLength: room.fixedCodeLength, clueTimeLimitSeconds: room.clueTimeLimitSeconds, answerTimeLimitSeconds: room.answerTimeLimitSeconds })} />全員に公開</span><span className="mt-1 block text-sm text-slate-300">ヒントと正解暗号の対応を全員の過去ログへ残します。</span></label>
              <label className={`mt-3 block cursor-pointer rounded-xl border p-4 ${room.codeRevealMode === "own-team" ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-slate-950/40"}`}><span className="flex items-center gap-2 font-black"><input type="radio" name="code-reveal-mode" checked={room.codeRevealMode === "own-team"} onChange={() => void runAction({ type: "set-config", actorId: playerId, cardCount: room.cardCount, teamAssignmentMode: room.teamAssignmentMode, codeLengthMode: room.codeLengthMode, codeRevealMode: "own-team", fixedCodeLength: room.fixedCodeLength, clueTimeLimitSeconds: room.clueTimeLimitSeconds, answerTimeLimitSeconds: room.answerTimeLimitSeconds })} />自チームだけ</span><span className="mt-1 block text-sm text-slate-300">相手には伝達・傍受の成否だけを見せ、正解暗号と味方回答を伏せます。</span></label>
            </fieldset>
          </div>
          {isHost ? <button type="button" disabled={isSaving || !codeInterceptRoomIsStartable(room) || !allRoomPlayersReturned(room.lobbyReturn, room.players)} onClick={() => void runAction({ type: "start-game", actorId: playerId })} className="mt-5 w-full rounded-xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950 disabled:opacity-40">{!allRoomPlayersReturned(room.lobbyReturn, room.players) ? "参加者の復帰待ち" : codeInterceptRoomIsStartable(room) ? room.teamAssignmentMode === "random" ? "ランダム編成して開始" : "このチームで開始" : room.teamAssignmentMode === "random" ? "4人以上必要です" : "各チーム2人以上・人数差1以内にしてください"}</button> : <p className="mt-5 text-center font-bold text-slate-300">ホストが開始するまでお待ちください。</p>}
        </section>}

        {room.phase !== "lobby" && <TeamScoreBoard room={room} />}

        {room.phase !== "lobby" && room.phase !== "game-result" && myTeam && <section className={`rounded-2xl border p-5 ${teamStyle(myTeam.id)}`}><div><p className="text-xs font-black tracking-[0.2em]">YOUR SECRET CARDS</p><h2 className="mt-1 text-xl font-black">{teamLabel(myTeam.id)}の秘密カード</h2></div><SecretWordGrid team={myTeam} /></section>}

        {room.phase === "game-result" && <RevealedSecretCards room={room} />}

        {room.phase === "code-length" && myTeamId && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-black text-cyan-300">第{room.roundNumber}ラウンド・桁数選択</p><PhaseTimer room={room} /></div>
          {isClueGiver ? <>
            <h2 className="mt-2 text-2xl font-black">今回の暗号は何桁にしますか？</h2>
            {room.codeLengthChoices[myTeamId] ? <p className="mt-5 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-center text-xl font-black text-emerald-100">{room.codeLengthChoices[myTeamId]?.codeLength}桁で確定しました</p> : <div className="mt-5 grid gap-3 sm:grid-cols-3">{Array.from({ length: room.cardCount - 1 }, (_, index) => index + 2).map((length) => <button key={length} type="button" disabled={isSaving} onClick={() => void runAction({ type: "select-code-length", actorId: playerId, codeLength: length })} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-5 text-2xl font-black text-cyan-100 hover:bg-cyan-300 hover:text-cyan-950 disabled:opacity-40">{length}桁</button>)}</div>}
          </> : <><h2 className="mt-2 text-2xl font-black">出題者が桁数を選択中</h2><p className="mt-3 text-slate-300">今回の出題者：{room.players.find((player) => player.id === room.clueGiverIds[myTeamId])?.name ?? "確認中"}</p>{room.codeLengthChoices[myTeamId] && <p className="mt-4 rounded-xl bg-emerald-300/10 p-3 font-black text-emerald-100">自チームは選択済みです。相手チームの確定を待っています。</p>}</>}
          <p className="mt-5 rounded-xl bg-white/[0.05] p-4 text-sm leading-6 text-slate-300">短いほど味方へ伝えやすく、敵にも当てられやすくなります。長いほど傍受されにくくなりますが、ヒントを多く公開します。</p>
          <p className="mt-4 text-center text-sm text-slate-400">両チームが確定するまで、相手が選んだ桁数は表示されません。</p>
        </section>}

        {room.phase === "clue" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-black text-amber-300">第{room.roundNumber}ラウンド・ヒント入力</p><PhaseTimer room={room} /></div>
          <div className="mt-3 grid grid-cols-2 gap-3">{codeInterceptTeamIds.map((teamId) => <div key={teamId} className={`rounded-xl border p-3 text-center ${teamStyle(teamId)}`}><span className="text-sm font-bold">{teamLabel(teamId)}</span><strong className="ml-2 text-xl">{codeLengthForTeam(room, teamId)}桁</strong></div>)}</div>
          {isClueGiver && myCode ? <><h2 className="mt-4 text-2xl font-black">あなたが出題者です</h2><div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-center"><p className="text-xs font-black text-amber-200">今回の暗号</p><p className="mt-2 font-mono text-5xl font-black tracking-widest text-amber-200">{myCode.join("・")}</p></div>{room.clues[myTeamId!] && <p className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm font-bold text-emerald-100">提出済みです。相手チームが提出するまでは変更できます。</p>}<div className="mt-4 grid gap-3 sm:grid-cols-4">{Array.from({ length: myCodeLength }, (_, index) => <label key={index} className="text-sm font-bold">{index + 1}つ目のヒント<input value={clueDrafts[index] ?? ""} maxLength={40} onChange={(event) => setClueDraftsByRound((current) => { const next = [...(current[draftRound] ?? room.clues[myTeamId!] ?? Array.from({ length: myCodeLength }, () => ""))]; next[index] = event.target.value; return { ...current, [draftRound]: next }; })} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3" /></label>)}</div><button type="button" disabled={isSaving || clueDrafts.length < myCodeLength || clueDrafts.slice(0, myCodeLength).some((clue) => !clue.trim())} onClick={() => void runAction({ type: "submit-clues", actorId: playerId, clues: clueDrafts.slice(0, myCodeLength).map((clue) => clue.trim()) }).then((saved) => { if (saved) setClueDraftsByRound((current) => ({ ...current, [draftRound]: Array.from({ length: myCodeLength }, () => "") })); })} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40">{room.clues[myTeamId!] ? "ヒントを再提出" : "ヒントを確定"}</button></> : <><h2 className="mt-4 text-2xl font-black">出題者がヒントを作成中</h2><p className="mt-3 text-slate-300">今回の出題者：{room.players.find((player) => player.id === room.clueGiverIds[myTeamId!])?.name ?? "確認中"}</p></>}
          <p className="mt-4 text-center text-sm text-slate-400">両チームが提出するまで、敵のヒントは表示されません。</p>
        </section>}

        {room.phase === "answer" && myTeamId && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-black text-amber-300">第{room.roundNumber}ラウンド・同時回答</p><PhaseTimer room={room} /></div><h2 className="mt-2 text-2xl font-black">両チームのヒントが公開されました</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{codeInterceptTeamIds.map((teamId) => <div key={teamId} className={`rounded-xl border p-4 ${teamStyle(teamId)}`}><p className="font-black">{teamLabel(teamId)}・{codeLengthForTeam(room, teamId)}桁</p><ol className="mt-2 space-y-1">{room.clues[teamId]?.map((clue, index) => <li key={index}><span className="mr-2 font-mono text-slate-400">{index + 1}.</span><strong>{clue}</strong></li>)}</ol></div>)}</div>
          {isClueGiver ? <p className="mt-5 rounded-xl bg-white/[0.05] p-4 text-sm text-slate-300">あなたは今回の出題者です。味方の回答者全員の案が一致するまで待ってください。</p> : <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className={`rounded-2xl border p-4 ${myTeamId === "red" ? "order-1" : "order-2"} ${teamStyle(myTeamId)}`}><AnswerEditor title={`味方の暗号を回答（${myCodeLength}桁）`} room={room} answererIds={myAnswererIds} proposals={room.allyAnswerProposals} submittedAnswer={room.allyAnswers[myTeamId]} draft={allyDraft} codeLength={myCodeLength} saving={isSaving} canRevise={!enemyAnswersSubmitted} submitLabel={myAnswererIds.length > 1 ? room.allyAnswerProposals[playerId] ? "回答案を更新" : "回答案を共有" : "チーム回答を確定"} resubmitLabel="味方回答を再提出" buttonClass="bg-emerald-300 text-emerald-950" onChange={(value) => setAllyDraftsByRound((current) => ({ ...current, [draftRound]: value }))} onSubmit={() => void runAction({ type: "submit-ally-answer", actorId: playerId, answer: allyDraft }).then((saved) => { if (saved) setAllyDraftsByRound((current) => ({ ...current, [draftRound]: [] })); })} /></div>
            <div className={`rounded-2xl border p-4 ${otherCodeInterceptTeam(myTeamId) === "red" ? "order-1" : "order-2"} ${teamStyle(otherCodeInterceptTeam(myTeamId))}`}>{room.roundNumber === 1 ? <><h3 className="font-black">敵の暗号を傍受（{enemyCodeLength}桁）</h3><p className="mt-3 text-sm text-slate-300">第1ラウンドは傍受回答を行いません。</p></> : <AnswerEditor title={`敵の暗号を傍受（${enemyCodeLength}桁）`} room={room} answererIds={myAnswererIds} proposals={room.interceptAnswerProposals} submittedAnswer={room.interceptAnswers[myTeamId]} draft={interceptDraft} codeLength={enemyCodeLength} saving={isSaving} canRevise={!enemyAnswersSubmitted} submitLabel={myAnswererIds.length > 1 ? room.interceptAnswerProposals[playerId] ? "回答案を更新" : "回答案を共有" : "傍受回答を確定"} resubmitLabel="傍受回答を再提出" buttonClass="bg-sky-300 text-sky-950" onChange={(value) => setInterceptDraftsByRound((current) => ({ ...current, [draftRound]: value }))} onSubmit={() => void runAction({ type: "submit-intercept-answer", actorId: playerId, answer: interceptDraft }).then((saved) => { if (saved) setInterceptDraftsByRound((current) => ({ ...current, [draftRound]: [] })); })} />}</div>
          </div>}
          <p className="mt-4 text-center text-sm text-slate-400">回答者が複数いるチームは全員一致で確定します。相手チームが回答を完了するまでは確定後も再提出できます。</p></section>}

        {(room.phase === "round-result" || room.phase === "game-result") && latestRound && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><p className="text-sm font-black text-amber-300">第{latestRound.roundNumber}ラウンド結果</p><div className="mt-4 grid gap-4 lg:grid-cols-2">{latestRound.teams.map((result) => <ResultCard key={result.teamId} result={result} room={room} />)}</div>{room.phase === "round-result" && (isHost ? <button type="button" disabled={isSaving} onClick={() => void runAction({ type: "next-round", actorId: playerId })} className="mt-5 w-full rounded-xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950">次のラウンドへ</button> : <p className="mt-5 text-center font-bold text-slate-300">ホストが次のラウンドへ進めます。</p>)}</section>}

        {room.phase === "game-result" && <section className="rounded-2xl border border-amber-300/30 bg-slate-950/85 p-6 text-center"><p className="text-sm font-black text-amber-300">GAME OVER</p><h2 className="mt-2 text-4xl font-black">{room.winner === "draw" ? "同時決着・引き分け" : `${teamLabel(room.winner!)}の勝利`}</h2><p className="mt-3 text-slate-300">全{room.roundNumber}ラウンドで決着しました。</p><RoomResultActions canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={isSaving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : returnToRoom} onDissolve={isHost ? dissolveRoom : undefined} /><GameResultShareButton title="コードインターセプト プレイログ" text={codeInterceptShareText(room)} url="/games/code-intercept" /></section>}

        {room.phase !== "lobby" && room.roundHistory.length > 0 && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-xl font-black">公開済みの過去ログ</h2><p className="mt-1 text-sm text-slate-400">チームごとに、ヒント・味方回答・相手からの傍受結果を確認できます。</p><div className="mt-4 grid gap-4 xl:grid-cols-2">{codeInterceptTeamIds.map((teamId) => <TeamRoundHistoryTable key={teamId} room={room} teamId={teamId} />)}</div></section>}
      </div>
    </div>
  </main>;
}
