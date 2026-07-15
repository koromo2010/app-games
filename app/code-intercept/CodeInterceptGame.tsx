"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DebugModeButton } from "@/app/components/DebugModeButton";
import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import { RoomResultActions } from "@/app/components/RoomResultActions";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "@/app/hooks/use-online-room-polling";
import { useRoomResultReturnGate } from "@/app/hooks/use-room-result-return-gate";
import { applyCodeInterceptRoomAction, codeInterceptRoomApi, createCodeInterceptRoom } from "@/app/code-intercept/code-intercept-room-api-client";
import {
  codeInterceptDefaults,
  codeInterceptMinimumPlayers,
  codeInterceptPlayerLimit,
  codeInterceptShareText,
  codeInterceptTeamIds,
  codeInterceptTeamsAreStartable,
  isValidCodeInterceptAnswer,
  otherCodeInterceptTeam,
  teamPlayers,
  type CodeInterceptPlayer,
  type CodeInterceptRoom,
  type CodeInterceptRoomAction,
  type CodeInterceptRoomChoice,
  type CodeInterceptTeamId,
  type CodeInterceptTeamRoundResult,
} from "@/lib/code-intercept";
import { OnlineRoomApiError, restoreOnlineRoom } from "@/lib/online-room-api-client";
import { defaultAvatarImage, fallbackAvatarColor, isPlayerAuthenticated, loadPersistentPlayerSession, type PlayerSession } from "@/lib/player-session";

const lastRoomKey = "code-intercept-last-room";
const ownerIdKey = "code-intercept-owner-id";

function makeRoomCode() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }
function getOwnerId() {
  const saved = localStorage.getItem(ownerIdKey);
  if (saved) return saved;
  const created = crypto.randomUUID();
  localStorage.setItem(ownerIdKey, created);
  return created;
}

function teamLabel(teamId: CodeInterceptTeamId) { return teamId === "red" ? "赤チーム" : "青チーム"; }
function teamStyle(teamId: CodeInterceptTeamId) {
  return teamId === "red"
    ? "border-rose-300/35 bg-rose-300/10 text-rose-50"
    : "border-sky-300/35 bg-sky-300/10 text-sky-50";
}

function apiMessage(error: unknown, fallback: string) {
  if (!(error instanceof OnlineRoomApiError)) return fallback;
  if (error.status === 401) return "合言葉が違うか、ログインの有効期限が切れています。";
  if (error.status === 403) return "この操作を行う権限がありません。";
  if (error.status === 404) return "部屋が見つかりません。";
  if (error.status === 409) return "チーム人数、部屋の状態、または同時更新を確認してもう一度お試しください。";
  if (error.status === 503) return "部屋サーバーを利用できません。少し待ってお試しください。";
  return fallback;
}

function CodePicker({ value, cardCount, codeLength, disabled, onChange }: { value: number[]; cardCount: number; codeLength: number; disabled?: boolean; onChange: (value: number[]) => void }) {
  return <div className="grid grid-cols-3 gap-2">{Array.from({ length: codeLength }, (_, index) => <label key={index} className="text-xs font-bold text-slate-300">{index + 1}桁目
    <select value={value[index] ?? ""} disabled={disabled} onChange={(event) => { const next = [...value]; next[index] = Number(event.target.value); onChange(next); }} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-800 px-3 py-3 text-center text-lg font-black text-white">
      <option value="">―</option>
      {Array.from({ length: cardCount }, (_, number) => number + 1).map((number) => <option key={number} value={number} disabled={value.some((item, itemIndex) => itemIndex !== index && item === number)}>{number}</option>)}
    </select>
  </label>)}</div>;
}

function PlayerCard({ player, room, me, saving, onTeamChange }: { player: CodeInterceptPlayer; room: CodeInterceptRoom; me: string; saving: boolean; onTeamChange: (teamId: CodeInterceptTeamId) => void }) {
  const isMe = player.id === me;
  return <li className={`flex items-center gap-3 rounded-xl border p-3 ${teamStyle(player.teamId)}`}>
    <span className="h-9 w-9 shrink-0 rounded-full border border-white/40 bg-cover bg-center" style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }} />
    <span className="min-w-0 flex-1 truncate font-bold">{player.name}{isMe ? "（あなた）" : ""}</span>
    {player.isDummy && <span className="rounded bg-cyan-100 px-2 py-1 text-xs font-black text-cyan-950">ダミー</span>}
    {player.id === room.hostId && <span className="rounded bg-amber-300 px-2 py-1 text-xs font-black text-slate-950">ホスト</span>}
    {isMe && room.phase === "lobby" && <button type="button" disabled={saving} onClick={() => onTeamChange(otherCodeInterceptTeam(player.teamId))} className="rounded-lg border border-white/20 px-2 py-1 text-xs font-black">{player.teamId === "red" ? "青へ" : "赤へ"}</button>}
  </li>;
}

function ResultCard({ result, room }: { result: CodeInterceptTeamRoundResult; room: CodeInterceptRoom }) {
  const enemy = otherCodeInterceptTeam(result.teamId);
  return <article className={`rounded-2xl border p-5 ${teamStyle(result.teamId)}`}>
    <div className="flex items-center justify-between"><h3 className="text-xl font-black">{teamLabel(result.teamId)}</h3><span className="font-mono text-xl font-black">{result.pointsBefore} → {result.pointsAfter}点</span></div>
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-slate-400">正解暗号</dt><dd className="font-mono font-black">{result.secretCode.join("・")}</dd>
      <dt className="text-slate-400">ヒント</dt><dd className="font-black">{result.clues.join("／")}</dd>
      <dt className="text-slate-400">味方回答</dt><dd>{result.allyAnswer?.join("・") ?? "未回答"} <strong className={result.allyCorrect ? "text-emerald-200" : "text-rose-200"}>{result.allyCorrect ? "伝達成功" : `伝達失敗 −${result.miscommunicationDamage}`}</strong></dd>
      <dt className="text-slate-400">{teamLabel(enemy)}の傍受</dt><dd>{result.enemyInterceptAnswer?.join("・") ?? (room.roundNumber === 1 ? "第1ラウンドはなし" : "未回答")} {room.roundNumber >= 2 && <strong className={result.enemyIntercepted ? "text-rose-200" : "text-emerald-200"}>{result.enemyIntercepted ? `傍受成功 −${result.interceptionDamage}` : "傍受回避"}</strong>}</dd>
      <dt className="font-bold">今回のダメージ</dt><dd className="font-black text-rose-200">−{result.totalDamage}</dd>
    </dl>
  </article>;
}

export function CodeInterceptGame() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [room, setRoom] = useState<CodeInterceptRoom | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [choices, setChoices] = useState<CodeInterceptRoomChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [newPlayerCapacity, setNewPlayerCapacity] = useState(6);
  const [clueDraftsByRound, setClueDraftsByRound] = useState<Record<number, string[]>>({});
  const [allyDraftsByRound, setAllyDraftsByRound] = useState<Record<number, number[]>>({});
  const [interceptDraftsByRound, setInterceptDraftsByRound] = useState<Record<number, number[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const resultReturnGate = useRoomResultReturnGate({ room, setRoom, playerId: session?.id ?? "", resultPhase: "game-result", onReturnUnavailable: () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。") });

  useEffect(() => {
    let active = true;
    if (!isPlayerAuthenticated()) {
      const timer = window.setTimeout(() => { if (active) setReady(true); }, 0);
      return () => { active = false; window.clearTimeout(timer); };
    }
    void loadPersistentPlayerSession().then(async (saved) => {
      if (!active || !saved?.id) { if (active) setReady(true); return; }
      setSession(saved);
      const restored = await restoreOnlineRoom({ playerId: saved.id, lastCode: localStorage.getItem(lastRoomKey), fetchActiveRoom: codeInterceptRoomApi.fetchActiveRoom, fetchRoom: codeInterceptRoomApi.fetchRoom });
      if (!active) return;
      if (restored) { setRoom(restored); localStorage.setItem(lastRoomKey, restored.code); }
      setReady(true);
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const playerId = session?.id ?? "";
  useOnlineRoomPolling({
    roomCode: playerId && !resultReturnGate.isRoomDissolved ? room?.code : null,
    intervalMs: room?.phase === "lobby" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active,
    fetchRoom: (code) => codeInterceptRoomApi.fetchRoom(code, playerId),
    onRoom: resultReturnGate.acceptIncomingRoom,
    onMissing: () => {
      localStorage.removeItem(lastRoomKey);
      if (resultReturnGate.markRoomDissolved()) {
        setError("部屋が解散されました。結果画面はこのまま確認できます。");
        return;
      }
      setRoom(null);
      setError("部屋が解散されたか、参加情報がなくなりました。");
    },
  });

  const isHost = Boolean(room && room.hostId === playerId);
  const me = room?.players.find((player) => player.id === playerId);
  const myTeamId = me?.teamId;
  const myTeam = room?.teams.find((team) => team.id === myTeamId);
  const myCode = myTeamId ? room?.secretCodes[myTeamId] : undefined;
  const isClueGiver = Boolean(room && myTeamId && room.clueGiverIds[myTeamId] === playerId);
  const latestRound = room?.roundHistory.at(-1);
  const teamCounts = useMemo(() => room ? Object.fromEntries(codeInterceptTeamIds.map((id) => [id, teamPlayers(room, id).length])) as Record<CodeInterceptTeamId, number> : { red: 0, blue: 0 }, [room]);
  const draftRound = room?.roundNumber ?? 1;
  const clueDrafts = clueDraftsByRound[draftRound] ?? ["", "", ""];
  const allyDraft = allyDraftsByRound[draftRound] ?? [];
  const interceptDraft = interceptDraftsByRound[draftRound] ?? [];

  const runAction = useCallback(async (action: CodeInterceptRoomAction) => {
    if (!room || isSaving) return null;
    setIsSaving(true); setError("");
    try { const saved = await applyCodeInterceptRoomAction(room.code, action); setRoom(saved); return saved; }
    catch (caught) { setError(apiMessage(caught, "操作を保存できませんでした。")); return null; }
    finally { setIsSaving(false); }
  }, [isSaving, room]);

  const createRoom = async () => {
    if (!session?.id || isSaving) return;
    setIsSaving(true); setError("");
    const now = Date.now();
    const host: CodeInterceptPlayer = { id: session.id, name: session.name, joinedAt: now, teamId: "red", avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
    const draft: CodeInterceptRoom = {
      code: makeRoomCode(), revision: 0, hostId: session.id, ownerId: getOwnerId(), passphrase: passphrase.trim(), phase: "lobby", players: [host], playerCapacity: newPlayerCapacity, gameNumber: 1, roundNumber: 1,
      cardCount: codeInterceptDefaults.cardCount, codeLength: codeInterceptDefaults.codeLength, initialPoints: codeInterceptDefaults.initialPoints, miscommunicationDamage: codeInterceptDefaults.miscommunicationDamage, interceptionDamage: codeInterceptDefaults.interceptionDamage, actionTimeLimitSeconds: 0, phaseStartedAt: null,
      debugMode: false, debugReplayEnabled: false, teams: codeInterceptTeamIds.map((id) => ({ id, name: teamLabel(id), points: codeInterceptDefaults.initialPoints, secretWords: [] })), clueGiverIds: {}, secretCodes: {}, clues: {}, allyAnswers: {}, interceptAnswers: {}, roundHistory: [], winner: null, debugLog: [], createdAt: now, updatedAt: now,
    };
    try { const data = await createCodeInterceptRoom(draft, session.id); setRoom(data.room); localStorage.setItem(lastRoomKey, data.room.code); }
    catch (caught) { setError(apiMessage(caught, "部屋を作成できませんでした。")); }
    finally { setIsSaving(false); }
  };

  const joinRoom = async (selectedCode?: string) => {
    if (!session?.id || isSaving) return;
    const code = (selectedCode ?? joinCode).trim().toUpperCase();
    if (code.length !== 4) { setError("4文字の部屋コードを入力してください。"); return; }
    setIsSaving(true); setError("");
    const player: CodeInterceptPlayer = { id: session.id, name: session.name, joinedAt: Date.now(), teamId: "red", avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
    try { const saved = await applyCodeInterceptRoomAction(code, { type: "join-room", actorId: session.id, player, passphrase }); setRoom(saved); setShowChoices(false); localStorage.setItem(lastRoomKey, saved.code); }
    catch (caught) { setError(apiMessage(caught, "部屋へ参加できませんでした。")); }
    finally { setIsSaving(false); }
  };

  const listRooms = async () => {
    setError("");
    try { setChoices(await codeInterceptRoomApi.fetchJoinableRooms()); setShowChoices(true); }
    catch (caught) { setError(apiMessage(caught, "部屋一覧を取得できませんでした。")); }
  };

  const leaveRoom = async () => { if (await runAction({ type: "leave-room", actorId: playerId })) { setRoom(null); localStorage.removeItem(lastRoomKey); } };
  const dissolveRoom = async () => {
    if (!room || !window.confirm("この部屋を解散しますか？")) return;
    setIsSaving(true); setError("");
    try {
      await codeInterceptRoomApi.remove({ code: room.code, actorId: playerId });
      localStorage.removeItem(lastRoomKey);
      if (resultReturnGate.markRoomDissolved()) setError("部屋を解散しました。結果画面はこのまま確認できます。");
      else setRoom(null);
    }
    catch (caught) { setError(apiMessage(caught, "部屋を解散できませんでした。")); }
    finally { setIsSaving(false); }
  };

  const rulesDialog = <GameRulesDialog open={rulesOpen} title="暗号傍受（仮）のルール" onClose={() => setRulesOpen(false)}>
    <p>4人以上で赤・青の2チームに分かれ、秘密の単語と番号の対応を味方へ伝えながら敵の対応を推理します。</p>
    <ol className="mt-4 list-decimal space-y-2 pl-5">
      <li>各チームは1〜4番の秘密単語を持ちます。敵チームには見えません。</li>
      <li>出題者には重複しない3桁の暗号が表示されます。暗号順に3つの連想ヒントを書きます。</li>
      <li>両チームのヒントを同時公開し、出題者以外が味方の暗号をチーム回答します。</li>
      <li>第2ラウンドからは、敵のヒントと過去ログを基に敵暗号もチーム回答します。</li>
      <li>味方回答が不正解または未回答なら自チームに1ダメージ、敵に傍受されたら2ダメージです。同じラウンドでは合算します。</li>
      <li>両チームのダメージを同時反映し、0点になったチームが敗北します。両方0点なら引き分けです。</li>
      <li>出題者はチーム内でラウンドごとに交代します。時間制限は初期版ではありません。</li>
    </ol>
  </GameRulesDialog>;

  if (!ready) return <main className="min-h-screen bg-slate-950 p-8 text-white">ログイン情報と部屋を確認中...</main>;
  if (!session?.id) return <main className="min-h-screen bg-slate-950 px-4 py-12 text-white"><div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center"><h1 className="text-3xl font-black">暗号傍受（仮）</h1><p className="mt-4 text-slate-300">このゲームはログインしたプレイヤー同士で遊びます。</p><Link href="/games" className="mt-6 inline-flex rounded-xl bg-amber-300 px-5 py-3 font-black text-slate-950">ゲームロビーへ</Link></div><GameAdSlot gameId="code-intercept" surface="game-entry" /></main>;

  if (!room) return <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#7f1d1d_0%,#172033_42%,#020617_82%)] px-4 pb-8 text-white ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="PRIVATE TEAM PROTOTYPE" title="暗号傍受（仮）"><Link href="/games" className={gameTopBannerActionClass}>ゲームロビーへ戻る</Link><GameTopMenu><button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button></GameTopMenu><GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} /></GameTopBanner>
    <section className="mx-auto mt-6 max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl">
      <div className="bg-gradient-to-r from-rose-300 via-amber-200 to-sky-300 px-6 py-8 text-slate-950"><p className="text-xs font-black tracking-[0.25em]">INTERCEPT THE SIGNAL</p><h1 className="mt-2 text-4xl font-black sm:text-6xl">暗号傍受（仮）</h1><p className="mt-3 font-bold">味方には正確に。敵には悟られず。敵の暗号は傍受せよ。</p></div>
      <div className="grid gap-6 p-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋を作る</h2><label className="mt-4 block text-sm font-bold">最大募集人数<select value={newPlayerCapacity} onChange={(event) => setNewPlayerCapacity(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-800 px-3 py-2 text-white">{Array.from({ length: codeInterceptPlayerLimit - codeInterceptMinimumPlayers + 1 }, (_, index) => index + codeInterceptMinimumPlayers).map((count) => <option key={count} value={count}>{count}人</option>)}</select></label><label className="mt-4 block text-sm font-bold">合言葉（任意）<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2" /></label><button type="button" disabled={isSaving} onClick={() => void createRoom()} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">新しい部屋を作る</button></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋に参加</h2><label className="mt-4 block text-sm font-bold">部屋コード<input value={joinCode} maxLength={4} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-lg uppercase" /></label><label className="mt-3 block text-sm font-bold">合言葉<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2" /></label><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={isSaving} onClick={() => void joinRoom()} className="rounded-xl bg-sky-300 px-3 py-3 font-black text-sky-950">コードで参加</button><button type="button" onClick={() => void listRooms()} className="rounded-xl border border-white/20 px-3 py-3 font-black">部屋一覧</button></div></div>
      </div>
      {showChoices && <div className="border-t border-white/10 p-6"><h2 className="font-black">参加できる部屋</h2>{choices.length === 0 ? <p className="mt-3 text-sm text-slate-400">現在参加できる部屋はありません。</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{choices.map((choice) => <button key={choice.code} type="button" onClick={() => void joinRoom(choice.code)} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 text-left"><span className="font-mono text-lg font-black text-amber-200">{choice.code}</span><span className="ml-3 font-bold">{choice.hostName}</span><span className="mt-1 block text-xs text-slate-400">{choice.playerCount}/{choice.playerCapacity}人・赤{choice.redCount}／青{choice.blueCount}・合言葉{choice.hasPassphrase ? "あり" : "なし"}</span></button>)}</div>}</div>}
      {error && <p className="mx-6 mb-6 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
    </section><GameAdSlot gameId="code-intercept" surface="game-entry" />{rulesDialog}
  </main>;

  return <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#7f1d1d_0%,#172033_38%,#020617_78%)] text-white ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="PRIVATE TEAM PROTOTYPE" title={<>暗号傍受（仮） <span className="font-mono text-base text-amber-300">#{room.code}</span></>}>
      {room.phase === "lobby" && (isHost ? <button type="button" onClick={() => void dissolveRoom()} className={gameTopBannerDangerActionClass}>部屋を解散</button> : <Link href="/games" className={gameTopBannerActionClass}>ゲームロビーへ戻る</Link>)}
      <GameTopMenu>{room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>ゲームロビーへ戻る</Link>}<button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button>{room.phase === "lobby" && !isHost && <button type="button" data-menu-close="true" onClick={() => void leaveRoom()} className={gameTopMenuItemClass}>退出</button>}</GameTopMenu>
      {isHost && <DebugModeButton variant="banner" enabled={room.debugMode} disabled={isSaving || room.phase !== "lobby"} onAbort={room.debugMode && room.phase !== "lobby" ? () => runAction({ type: "abort-game", actorId: playerId }).then(() => undefined) : undefined} replayEnabled={room.debugReplayEnabled} replayDisabled={isSaving} onReplayChange={(enabled) => runAction({ type: "set-debug-replay", actorId: playerId, enabled }).then(() => undefined)} debugLogEntries={room.debugLog} onChange={(enabled) => runAction({ type: "set-debug", actorId: playerId, enabled }).then(() => undefined)} />}
      <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
    </GameTopBanner>
    {rulesDialog}<GameAdSlot gameId="code-intercept" surface={room.phase === "lobby" ? "room-lobby" : room.phase === "game-result" ? "result" : null} disabled={room.debugMode} />
    <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-4"><section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between"><h2 className="font-black">参加者</h2><span className="text-sm text-slate-400">{room.players.length}/{room.playerCapacity}人</span></div><ul className="mt-3 space-y-2">{room.players.map((player) => <PlayerCard key={player.id} player={player} room={room} me={playerId} saving={isSaving} onTeamChange={(teamId) => void runAction({ type: "set-team", actorId: playerId, teamId })} />)}</ul></section>
        <RoomConfigSummary items={[{ label: "秘密カード C", value: `${room.cardCount}枚` }, { label: "暗号桁数 Y", value: `${room.codeLength}桁` }, { label: "初期ポイント X", value: `${room.initialPoints}点` }, { label: "伝達失敗", value: `−${room.miscommunicationDamage}` }, { label: "傍受成功", value: `−${room.interceptionDamage}` }, { label: "傍受開始", value: "第2ラウンド" }, { label: "時間制限", value: "なし" }]} />
      </aside>
      <div className="space-y-4">
        {error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
        {room.phase === "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">チーム分け</h2><p className="mt-3 text-sm leading-6 text-slate-300">各チーム2人以上、人数差1人以内で開始できます。自分の名前の横からチームを移動できます。</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{codeInterceptTeamIds.map((teamId) => <div key={teamId} className={`rounded-xl border p-4 ${teamStyle(teamId)}`}><h3 className="text-lg font-black">{teamLabel(teamId)} <span className="font-mono">{teamCounts[teamId]}人</span></h3><p className="mt-2 text-sm">{teamPlayers(room, teamId).map((player) => player.name).join("・") || "未所属"}</p></div>)}</div>{isHost && room.debugMode && <button type="button" disabled={isSaving || room.players.length >= room.playerCapacity} onClick={() => void runAction({ type: "debug-add-player", actorId: playerId })} className="mt-5 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 font-black text-cyan-100">デバッグ：ダミーを追加</button>}{isHost ? <button type="button" disabled={isSaving || !codeInterceptTeamsAreStartable(room)} onClick={() => void runAction({ type: "start-game", actorId: playerId })} className="mt-5 w-full rounded-xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950 disabled:opacity-40">{codeInterceptTeamsAreStartable(room) ? "このチームで開始" : "各チーム2人以上・人数差1以内にしてください"}</button> : <p className="mt-5 text-center font-bold text-slate-300">ホストが開始するまでお待ちください。</p>}</section>}

        {room.phase !== "lobby" && myTeam && <section className={`rounded-2xl border p-5 ${teamStyle(myTeam.id)}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black tracking-[0.2em]">YOUR SECRET CARDS</p><h2 className="mt-1 text-xl font-black">{teamLabel(myTeam.id)}の秘密カード</h2></div><span className="rounded-xl bg-slate-950/60 px-3 py-2 font-mono text-lg font-black">残り {myTeam.points}点</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{myTeam.secretWords.map((word, index) => <div key={`${index}:${word}`} className="rounded-xl border border-white/15 bg-slate-950/50 p-3 text-center"><p className="font-mono text-xs text-slate-300">{index + 1}</p><p className="mt-1 text-lg font-black">{word}</p></div>)}</div></section>}

        {room.phase === "clue" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><p className="text-sm font-black text-amber-300">第{room.roundNumber}ラウンド・ヒント入力</p>{isClueGiver && myCode ? <><h2 className="mt-2 text-2xl font-black">あなたが出題者です</h2><div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-center"><p className="text-xs font-black text-amber-200">今回の暗号</p><p className="mt-2 font-mono text-5xl font-black tracking-widest text-amber-200">{myCode.join("・")}</p></div>{room.clues[myTeamId!] ? <p className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 font-black text-emerald-100">提出済み：{room.clues[myTeamId!]?.join("／")}</p> : <div className="mt-4 grid gap-3 sm:grid-cols-3">{Array.from({ length: room.codeLength }, (_, index) => <label key={index} className="text-sm font-bold">{index + 1}つ目のヒント<input value={clueDrafts[index] ?? ""} maxLength={40} onChange={(event) => setClueDraftsByRound((current) => { const next = [...(current[draftRound] ?? ["", "", ""])]; next[index] = event.target.value; return { ...current, [draftRound]: next }; })} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3" /></label>)}</div>}{!room.clues[myTeamId!] && <button type="button" disabled={isSaving || clueDrafts.some((clue) => !clue.trim())} onClick={() => void runAction({ type: "submit-clues", actorId: playerId, clues: clueDrafts.map((clue) => clue.trim()) })} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40">ヒントを確定</button>}</> : <><h2 className="mt-2 text-2xl font-black">出題者がヒントを作成中</h2><p className="mt-3 text-slate-300">今回の出題者：{room.players.find((player) => player.id === room.clueGiverIds[myTeamId!])?.name ?? "確認中"}</p></>}{isHost && room.debugMode && <button type="button" onClick={() => void runAction({ type: "debug-fill-clues", actorId: playerId })} className="mt-5 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 font-black text-cyan-100">デバッグ：ヒントを自動入力</button>}<p className="mt-4 text-center text-sm text-slate-400">両チームが提出するまで、敵のヒントは表示されません。</p></section>}

        {room.phase === "answer" && myTeamId && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><p className="text-sm font-black text-amber-300">第{room.roundNumber}ラウンド・同時回答</p><h2 className="mt-2 text-2xl font-black">両チームのヒントが公開されました</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{codeInterceptTeamIds.map((teamId) => <div key={teamId} className={`rounded-xl border p-4 ${teamStyle(teamId)}`}><p className="font-black">{teamLabel(teamId)}</p><ol className="mt-2 space-y-1">{room.clues[teamId]?.map((clue, index) => <li key={index}><span className="mr-2 font-mono text-slate-400">{index + 1}.</span><strong>{clue}</strong></li>)}</ol></div>)}</div>
          {isClueGiver ? <p className="mt-5 rounded-xl bg-white/[0.05] p-4 text-sm text-slate-300">あなたは今回の出題者です。味方の代表回答と傍受回答が確定するまで待ってください。</p> : <div className="mt-5 grid gap-5 lg:grid-cols-2"><div className={`rounded-2xl border p-4 ${teamStyle(myTeamId)}`}><h3 className="font-black">味方の暗号を回答</h3>{room.allyAnswers[myTeamId] ? <p className="mt-3 font-mono text-2xl font-black text-emerald-200">提出済み {room.allyAnswers[myTeamId]?.join("・")}</p> : <><div className="mt-3"><CodePicker value={allyDraft} cardCount={room.cardCount} codeLength={room.codeLength} onChange={(value) => setAllyDraftsByRound((current) => ({ ...current, [draftRound]: value }))} /></div><button type="button" disabled={isSaving || !isValidCodeInterceptAnswer(allyDraft, room.cardCount, room.codeLength)} onClick={() => void runAction({ type: "submit-ally-answer", actorId: playerId, answer: allyDraft })} className="mt-3 w-full rounded-xl bg-emerald-300 px-4 py-3 font-black text-emerald-950 disabled:opacity-40">チーム回答を確定</button></>}</div>
            <div className={`rounded-2xl border p-4 ${teamStyle(otherCodeInterceptTeam(myTeamId))}`}><h3 className="font-black">敵の暗号を傍受</h3>{room.roundNumber === 1 ? <p className="mt-3 text-sm text-slate-300">第1ラウンドは傍受回答を行いません。</p> : room.interceptAnswers[myTeamId] ? <p className="mt-3 font-mono text-2xl font-black text-emerald-200">提出済み {room.interceptAnswers[myTeamId]?.join("・")}</p> : <><div className="mt-3"><CodePicker value={interceptDraft} cardCount={room.cardCount} codeLength={room.codeLength} onChange={(value) => setInterceptDraftsByRound((current) => ({ ...current, [draftRound]: value }))} /></div><button type="button" disabled={isSaving || !isValidCodeInterceptAnswer(interceptDraft, room.cardCount, room.codeLength)} onClick={() => void runAction({ type: "submit-intercept-answer", actorId: playerId, answer: interceptDraft })} className="mt-3 w-full rounded-xl bg-sky-300 px-4 py-3 font-black text-sky-950 disabled:opacity-40">傍受回答を確定</button></>}</div></div>}
          {isHost && room.debugMode && <button type="button" onClick={() => void runAction({ type: "debug-fill-answers", actorId: playerId })} className="mt-5 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 font-black text-cyan-100">デバッグ：未回答を正解で埋める</button>}<p className="mt-4 text-center text-sm text-slate-400">各回答はチームで先に確定した1件を採用し、全回答が揃うまで相手の回答は見えません。</p></section>}

        {(room.phase === "round-result" || room.phase === "game-result") && latestRound && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><p className="text-sm font-black text-amber-300">第{latestRound.roundNumber}ラウンド結果</p><div className="mt-4 grid gap-4 lg:grid-cols-2">{latestRound.teams.map((result) => <ResultCard key={result.teamId} result={result} room={room} />)}</div>{room.phase === "round-result" && (isHost ? <button type="button" disabled={isSaving} onClick={() => void runAction({ type: "next-round", actorId: playerId })} className="mt-5 w-full rounded-xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950">次のラウンドへ</button> : <p className="mt-5 text-center font-bold text-slate-300">ホストが次のラウンドへ進めます。</p>)}</section>}

        {room.phase === "game-result" && <section className="rounded-2xl border border-amber-300/30 bg-slate-950/85 p-6 text-center"><p className="text-sm font-black text-amber-300">GAME OVER</p><h2 className="mt-2 text-4xl font-black">{room.winner === "draw" ? "同時決着・引き分け" : `${teamLabel(room.winner!)}の勝利`}</h2><p className="mt-3 text-slate-300">全{room.roundNumber}ラウンドで決着しました。</p><RoomResultActions canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={isSaving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : () => resultReturnGate.returnToRoom((code) => codeInterceptRoomApi.fetchRoom(code, playerId), () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"))} onDissolve={isHost ? dissolveRoom : undefined} /><GameResultShareButton title="暗号傍受（仮） プレイログ" text={codeInterceptShareText(room)} url="/code-intercept" /></section>}

        {room.roundHistory.length > 0 && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-xl font-black">公開済みの過去ログ</h2><p className="mt-1 text-sm text-slate-400">敵の番号と秘密単語の対応を推理するため、全ラウンドの公開情報を確認できます。</p><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-white/15 text-slate-400"><th className="px-2 py-2">R</th><th className="px-2 py-2">チーム</th><th className="px-2 py-2">ヒント</th><th className="px-2 py-2">正解暗号</th><th className="px-2 py-2">傍受回答</th><th className="px-2 py-2">結果</th></tr></thead><tbody>{room.roundHistory.flatMap((round) => round.teams.map((result) => <tr key={`${round.roundNumber}:${result.teamId}`} className="border-b border-white/[0.07]"><td className="px-2 py-3 font-mono">{round.roundNumber}</td><td className="px-2 py-3 font-black">{teamLabel(result.teamId)}</td><td className="px-2 py-3">{result.clues.join("・")}</td><td className="px-2 py-3 font-mono font-black">{result.secretCode.join("・")}</td><td className="px-2 py-3 font-mono">{result.enemyInterceptAnswer?.join("・") ?? "―"}</td><td className="px-2 py-3">{round.roundNumber === 1 ? "傍受なし" : result.enemyIntercepted ? "傍受成功" : "傍受失敗"}</td></tr>))}</tbody></table></div></section>}
      </div>
    </div>
  </main>;
}
