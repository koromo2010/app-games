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
import { applyNigoichiRoomAction, createNigoichiRoom, nigoichiRoomApi } from "@/app/nigoichi/nigoichi-room-api-client";
import {
  areValidNigoichiAssociations,
  correctNigoichiConfig,
  nigoichiConfigBounds,
  nigoichiGuessIsCorrect,
  nigoichiMaximumAssociationWords,
  nigoichiMaximumAssociationWordsForPlayers,
  nigoichiMinimumPlayers,
  nigoichiPlayerOwnsCard,
  nigoichiPlayerLimit,
  nigoichiShareText,
  nigoichiWordDifficultyLabels,
  type NigoichiPlayer,
  type NigoichiRoom,
  type NigoichiRoomAction,
  type NigoichiRoomChoice,
  type NigoichiWordDifficulty,
} from "@/lib/nigoichi";
import { OnlineRoomApiError, restoreOnlineRoom } from "@/lib/online-room-api-client";
import {
  defaultAvatarImage,
  fallbackAvatarColor,
  isPlayerAuthenticated,
  loadPersistentPlayerSession,
  type PlayerSession,
} from "@/lib/player-session";

const lastRoomKey = "nigoichi-last-room";
const ownerIdKey = "nigoichi-owner-id";

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function getOwnerId() {
  const saved = localStorage.getItem(ownerIdKey);
  if (saved) return saved;
  const created = crypto.randomUUID();
  localStorage.setItem(ownerIdKey, created);
  return created;
}

function apiMessage(error: unknown, fallback: string) {
  if (!(error instanceof OnlineRoomApiError)) return fallback;
  if (error.status === 401) return "合言葉が違うか、ログインの有効期限が切れています。";
  if (error.status === 403) return "この操作を行う権限がありません。";
  if (error.status === 404) return "部屋が見つかりません。";
  if (error.status === 409) return "部屋が満員か、ほかの端末で状態が更新されました。もう一度お試しください。";
  if (error.status === 503) return "部屋サーバーを利用できません。少し待ってお試しください。";
  return fallback;
}

function PlayerRow({ player, isHost, isMe, score }: { player: NigoichiPlayer; isHost: boolean; isMe: boolean; score: number }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl border p-3 ${isMe ? "border-indigo-300 bg-indigo-300/10" : "border-white/10 bg-white/[0.04]"}`}>
      <span className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-cover bg-center" style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-bold">{player.name}{isMe ? "（あなた）" : ""}</span>
      <span className="font-mono text-sm font-black text-indigo-200">{score}点</span>
      {player.isDummy && <span className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs font-black text-cyan-100">ダミー</span>}
      {isHost && <span className="rounded-md bg-amber-300 px-2 py-1 text-xs font-black text-slate-950">ホスト</span>}
    </li>
  );
}

export function NigoichiGame() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [room, setRoom] = useState<NigoichiRoom | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [choices, setChoices] = useState<NigoichiRoomChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [newPlayerCapacity, setNewPlayerCapacity] = useState(3);
  const [associationDrafts, setAssociationDrafts] = useState<Record<string, string[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    if (!isPlayerAuthenticated()) {
      timer = window.setTimeout(() => setReady(true), 0);
      return () => { active = false; if (timer) window.clearTimeout(timer); };
    }
    void loadPersistentPlayerSession().then(async (savedSession) => {
      if (!active || !savedSession?.id) { if (active) setReady(true); return; }
      setSession(savedSession);
      const savedRoom = await restoreOnlineRoom({
        playerId: savedSession.id,
        lastCode: localStorage.getItem(lastRoomKey),
        fetchActiveRoom: nigoichiRoomApi.fetchActiveRoom,
        fetchRoom: nigoichiRoomApi.fetchRoom,
      });
      if (!active) return;
      timer = window.setTimeout(() => {
        if (savedRoom) {
          setRoom(savedRoom);
          localStorage.setItem(lastRoomKey, savedRoom.code);
        }
        setReady(true);
      }, 0);
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, []);

  const roomCode = room?.code;
  const roomPhase = room?.phase;
  const playerId = session?.id ?? "";

  useOnlineRoomPolling({
    roomCode: playerId ? roomCode : null,
    intervalMs: roomPhase === "lobby" || roomPhase === "result" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active,
    fetchRoom: (code) => nigoichiRoomApi.fetchRoom(code, playerId),
    onRoom: (latest) => setRoom((current) => current?.revision === latest.revision ? current : latest),
    onMissing: () => {
      setRoom(null);
      localStorage.removeItem(lastRoomKey);
      setError("部屋が解散されたか、参加情報がなくなりました。");
    },
  });

  const isHost = Boolean(room && room.hostId === playerId);
  const myHand = room?.hands[playerId] ?? null;
  const submittedAssociations = room ? Object.keys(room.associations).length : 0;
  const submittedGuesses = room ? Object.keys(room.guesses).length : 0;
  const correctCount = room?.phase === "result" ? room.players.filter((player) => nigoichiGuessIsCorrect(room, player.id)).length : 0;
  const roomConfigPlayerCount = Math.max(nigoichiMinimumPlayers, room?.players.length ?? nigoichiMinimumPlayers);
  const roomBounds = room ? nigoichiConfigBounds(roomConfigPlayerCount, room.associationWordCount) : null;
  const roomTotalCards = room?.phase === "lobby"
    ? roomConfigPlayerCount * room.cardsPerPlayer + 1
    : room?.words.length ?? 0;
  const controllablePlayers = useMemo(() => {
    if (!room) return [];
    return room.players.filter((player) => player.id === playerId || (room.debugMode && isHost && player.isDummy));
  }, [isHost, playerId, room]);

  const runAction = useCallback(async (action: NigoichiRoomAction) => {
    if (!room || isSaving) return null;
    setIsSaving(true);
    setError("");
    try {
      const saved = await applyNigoichiRoomAction(room.code, action);
      setRoom(saved);
      return saved;
    } catch (caught) {
      setError(apiMessage(caught, "操作を保存できませんでした。"));
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, room]);

  const createRoom = async () => {
    if (!session?.id || isSaving) return;
    setIsSaving(true);
    setError("");
    const now = Date.now();
    const host: NigoichiPlayer = { id: session.id, name: session.name, joinedAt: now, avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
    const draft: NigoichiRoom = {
      code: makeRoomCode(), revision: 0, hostId: session.id, ownerId: getOwnerId(), passphrase: passphrase.trim(), phase: "lobby", players: [host], playerCapacity: newPlayerCapacity, gameNumber: 1,
      cardsPerPlayer: 2, associationWordCount: 1, wordDifficulty: "normal",
      debugMode: false, debugReplayEnabled: false, words: [], hands: {}, associations: {}, guesses: {}, missingNumber: null,
      totalScores: { [host.id]: 0 }, roundScores: {}, roundHistory: [], debugLog: [], createdAt: now, updatedAt: now,
    };
    try {
      const data = await createNigoichiRoom(draft, session.id);
      setRoom(data.room);
      localStorage.setItem(lastRoomKey, data.room.code);
    } catch (caught) {
      setError(apiMessage(caught, "部屋を作成できませんでした。"));
    } finally {
      setIsSaving(false);
    }
  };

  const joinRoom = async (selectedCode?: string) => {
    if (!session?.id || isSaving) return;
    const code = (selectedCode ?? joinCode).trim().toUpperCase();
    if (code.length !== 4) { setError("4文字の部屋コードを入力してください。"); return; }
    setIsSaving(true);
    setError("");
    const player: NigoichiPlayer = { id: session.id, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
    try {
      const saved = await applyNigoichiRoomAction(code, { type: "join-room", actorId: session.id, player, passphrase });
      setRoom(saved);
      setShowChoices(false);
      localStorage.setItem(lastRoomKey, saved.code);
    } catch (caught) {
      setError(apiMessage(caught, "部屋へ参加できませんでした。"));
    } finally {
      setIsSaving(false);
    }
  };

  const listRooms = async () => {
    setError("");
    try {
      const listed = await nigoichiRoomApi.fetchJoinableRooms();
      setChoices(listed);
      setShowChoices(true);
    } catch (caught) {
      setError(apiMessage(caught, "部屋一覧を取得できませんでした。"));
    }
  };

  const leaveRoom = async () => {
    const saved = await runAction({ type: "leave-room", actorId: playerId });
    if (!saved) return;
    setRoom(null);
    localStorage.removeItem(lastRoomKey);
  };

  const dissolveRoom = async () => {
    if (!room || !window.confirm("この部屋を解散しますか？")) return;
    setIsSaving(true);
    setError("");
    try {
      await nigoichiRoomApi.remove({ code: room.code, actorId: playerId });
      setRoom(null);
      localStorage.removeItem(lastRoomKey);
    } catch (caught) {
      setError(apiMessage(caught, "部屋を解散できませんでした。"));
    } finally {
      setIsSaving(false);
    }
  };

  const submitAssociations = (targetId: string) => {
    if (!room) return;
    const clues = Array.from({ length: room.associationWordCount }, (_, index) => (associationDrafts[targetId]?.[index] ?? "").trim());
    if (!areValidNigoichiAssociations(clues, room.associationWordCount)) {
      setError(`${room.associationWordCount}個すべての連想語を入力してください。`);
      return;
    }
    void runAction({ type: "submit-associations", actorId: playerId, playerId: targetId, clues }).then((saved) => {
      if (saved) setAssociationDrafts((current) => { const next = { ...current }; delete next[targetId]; return next; });
    });
  };

  const rulesDialog = <GameRulesDialog open={rulesOpen} title="ワードアウトのルール" onClose={() => setRulesOpen(false)}>
    <p>自分に配られたカードを見て連想語を書きます。全員の連想から、誰にも配られていない1枚を探します。</p>
    <ol className="mt-4 list-decimal space-y-2 pl-5">
      <li>初期設定は1人2枚・連想語1個です。1人に配るカードAを増やすと、より多くの言葉を連想語で伝えることになり、難易度を上げられます。</li>
      <li>書く連想語Mも設定できます。場には参加人数P×A+1枚を並べ、場のカード総数は最大21枚です。</li>
      <li>自分のA枚を見て、M個の連想語を自由に書きます。カードと連想語の分類や対応付けは必要ありません。</li>
      <li>全員が提出するまでは他人の連想語を見られません。</li>
      <li>連想語を一斉公開し、自分のカード以外から、誰にも配られていない番号を1つ選びます。予想は全員が選ぶまで非公開です。</li>
      <li>正解すると参加人数+1点です。自分のカードをほかの人に選ばれると、1票につき1点減点されます。</li>
      <li>全員の予想がそろうと得点内訳を公開し、同じ部屋で続けると累計得点を引き継ぎます。</li>
    </ol>
    <p className="mt-4 rounded-lg bg-amber-50 p-3 font-bold text-amber-950">自分のカードは回答に選べません。正解者は最大数の減点を受けても、ラウンド得点が必ず2点以上になります。時間制限はありません。</p>
  </GameRulesDialog>;

  if (!ready) return <main className="min-h-screen bg-slate-950 p-8 text-white">ログイン情報と部屋を確認中...</main>;

  if (!session?.id) {
    return <main className="min-h-screen bg-slate-950 px-4 py-12 text-white"><div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center"><h1 className="text-3xl font-black">ワードアウト</h1><p className="mt-4 leading-7 text-slate-300">このゲームはログインしたプレイヤー同士で遊びます。ゲームロビーでログインしてください。</p><Link href="/games" className="mt-6 inline-flex rounded-xl bg-indigo-300 px-5 py-3 font-black text-indigo-950">ゲームロビーへ</Link></div><GameAdSlot gameId="nigoichi" surface="game-entry" /></main>;
  }

  if (!room) {
    return (
      <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#4338ca_0%,#1e293b_42%,#020617_82%)] px-4 pb-8 text-white ${gameTopBannerOffsetClass}`}>
        <GameTopBanner eyebrow="WORD OUT" title="ワードアウト">
          <Link href="/games" className={gameTopBannerActionClass}>ゲームロビーへ戻る</Link>
          <GameTopMenu><button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button></GameTopMenu>
          <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
        </GameTopBanner>
        <div className="mx-auto max-w-4xl">
          <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl">
            <div className="bg-gradient-to-r from-indigo-300 via-amber-200 to-rose-300 px-6 py-8 text-slate-950"><p className="text-xs font-black uppercase tracking-[0.28em]">WORD OUT</p><h1 className="mt-2 text-4xl font-black sm:text-6xl">ワードアウト</h1><p className="mt-3 font-bold">みんなの連想を読み解き、誰にも配られていない言葉を見つけよう。</p><p className="mt-2 text-sm font-semibold">1人2枚が基本。1人に配る枚数を増やして難易度を上げられます。</p></div>
            <div className="grid gap-6 p-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
                <h2 className="text-xl font-black">部屋を作る</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">最大募集人数を決めて部屋を作ります。ゲーム設定は作成後に変更できます。</p>
                <label className="mt-4 block text-sm font-bold">最大募集人数
                  <select value={newPlayerCapacity} onChange={(event) => setNewPlayerCapacity(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-800 px-3 py-2 text-white">
                    {Array.from({ length: nigoichiPlayerLimit - nigoichiMinimumPlayers + 1 }, (_, index) => index + nigoichiMinimumPlayers).map((count) => <option key={count} value={count}>{count}人</option>)}
                  </select>
                </label>
                <label className="mt-4 block text-sm font-bold">合言葉（任意）<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label>
                <button type="button" disabled={isSaving} onClick={() => void createRoom()} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">新しい部屋を作る</button>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋に参加</h2><label className="mt-4 block text-sm font-bold">部屋コード<input value={joinCode} maxLength={4} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-lg uppercase text-white outline-none" /></label><label className="mt-3 block text-sm font-bold">合言葉<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={isSaving} onClick={() => void joinRoom()} className="rounded-xl bg-indigo-300 px-3 py-3 font-black text-indigo-950 disabled:opacity-50">コードで参加</button><button type="button" onClick={() => void listRooms()} className="rounded-xl border border-white/20 px-3 py-3 font-black">部屋一覧</button></div></div>
            </div>
            {showChoices && <div className="border-t border-white/10 p-6"><h2 className="font-black">参加できる部屋</h2>{choices.length === 0 ? <p className="mt-3 text-sm text-slate-400">現在参加できる部屋はありません。</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{choices.map((choice) => <button key={choice.code} type="button" onClick={() => { setJoinCode(choice.code); void joinRoom(choice.code); }} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 text-left"><span className="font-mono text-lg font-black text-indigo-200">{choice.code}</span><span className="ml-3 font-bold">{choice.hostName}</span><span className="mt-1 block text-xs text-slate-400">{choice.playerCount}/{choice.playerCapacity}人・A={choice.cardsPerPlayer}枚/人・M={choice.associationWordCount}語・{nigoichiWordDifficultyLabels[choice.wordDifficulty]}・合言葉{choice.hasPassphrase ? "あり" : "なし"}</span></button>)}</div>}</div>}
            {error && <p className="mx-6 mb-6 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          </section>
        </div>
        <GameAdSlot gameId="nigoichi" surface="game-entry" />
        {rulesDialog}
      </main>
    );
  }

  return (
    <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#4338ca_0%,#172033_38%,#020617_78%)] text-white ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow="WORD OUT" title={<>ワードアウト <span className="font-mono text-base text-amber-300">#{room.code}</span></>}>
        {room.phase === "lobby" && (isHost ? <button type="button" onClick={() => void dissolveRoom()} className={gameTopBannerDangerActionClass}>部屋を解散</button> : <Link href="/games" className={gameTopBannerActionClass}>ゲームロビーへ戻る</Link>)}
        <GameTopMenu>
          {room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>ゲームロビーへ戻る</Link>}
          <button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button>
          {room.phase === "lobby" && !isHost && <button type="button" data-menu-close="true" onClick={() => void leaveRoom()} className={gameTopMenuItemClass}>退出</button>}
        </GameTopMenu>
        {isHost && <DebugModeButton variant="banner" enabled={room.debugMode} disabled={isSaving || room.phase !== "lobby"} onAbort={room.debugMode && room.phase !== "lobby" ? () => runAction({ type: "abort-game", actorId: playerId }).then(() => undefined) : undefined} replayEnabled={room.debugReplayEnabled} replayDisabled={isSaving} onReplayChange={(enabled) => runAction({ type: "set-debug-replay", actorId: playerId, enabled }).then(() => undefined)} debugLogEntries={room.debugLog} onChange={(enabled) => runAction({ type: "set-debug", actorId: playerId, enabled }).then(() => undefined)} />}
        <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
      </GameTopBanner>
      {rulesDialog}
      <GameAdSlot gameId="nigoichi" surface={room.phase === "lobby" ? "room-lobby" : room.phase === "result" ? "result" : null} disabled={room.debugMode} />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between"><h2 className="font-black">参加者・累計得点</h2><span className="text-sm text-slate-400">{room.players.length}/{room.playerCapacity}人</span></div><ul className="mt-3 space-y-2">{room.players.map((player) => <PlayerRow key={player.id} player={player} isHost={player.id === room.hostId} isMe={player.id === playerId} score={room.totalScores[player.id] ?? 0} />)}</ul></section>
          <RoomConfigSummary items={[{ label: "最大募集人数", value: `${room.playerCapacity}人` }, { label: "P：現在の参加人数", value: `${room.players.length}人` }, { label: "A：1人に配るカード", value: `${room.cardsPerPlayer}枚` }, { label: "M：書く連想語", value: `${room.associationWordCount}語` }, { label: "B：場に並ぶカード", value: `${roomTotalCards}枚` }, { label: "難易度", value: nigoichiWordDifficultyLabels[room.wordDifficulty] }, { label: "合言葉", value: room.passphrase ? "あり" : "なし" }, { label: "時間制限", value: "なし" }]} />
        </aside>
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          {room.phase === "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6">
            <h2 className="text-2xl font-black">ゲーム開始前</h2>
            <p className="mt-3 rounded-xl bg-white/[0.05] p-4 text-sm leading-6 text-slate-300">最大募集人数は{room.playerCapacity}人です。2人以上集まれば開始できます。初期設定は1人2枚・連想語1個で、1人に配る枚数を増やすと難易度を上げられます。開始後、各自の手札は本人の端末だけに表示されます。</p>
            {isHost && <div className="mt-5 rounded-xl border border-indigo-300/25 bg-indigo-300/10 p-4">
              <h3 className="font-black text-indigo-100">ゲーム設定</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-bold">1人に配るカード A
                  <select value={room.cardsPerPlayer} disabled={isSaving || !roomBounds} onChange={(event) => void runAction({ type: "set-config", actorId: playerId, cardsPerPlayer: Number(event.target.value), associationWordCount: room.associationWordCount, wordDifficulty: room.wordDifficulty })} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2 text-white">
                    {roomBounds && Array.from({ length: roomBounds.maxCardsPerPlayer - roomBounds.minCardsPerPlayer + 1 }, (_, index) => roomBounds.minCardsPerPlayer + index).map((count) => <option key={count} value={count}>{count}枚</option>)}
                  </select>
                </label>
                <label className="text-sm font-bold">書く連想語 M
                  <select value={room.associationWordCount} disabled={isSaving} onChange={(event) => { const corrected = correctNigoichiConfig(roomConfigPlayerCount, room.cardsPerPlayer, Number(event.target.value)); void runAction({ type: "set-config", actorId: playerId, cardsPerPlayer: corrected.cardsPerPlayer, associationWordCount: corrected.associationWordCount, wordDifficulty: room.wordDifficulty }); }} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2 text-white">
                    {Array.from({ length: nigoichiMaximumAssociationWords }, (_, index) => index + 1).map((count) => <option key={count} value={count} disabled={count > nigoichiMaximumAssociationWordsForPlayers(roomConfigPlayerCount)}>{count}語</option>)}
                  </select>
                </label>
                <label className="text-sm font-bold">言葉の難易度
                  <select value={room.wordDifficulty} disabled={isSaving} onChange={(event) => void runAction({ type: "set-config", actorId: playerId, cardsPerPlayer: room.cardsPerPlayer, associationWordCount: room.associationWordCount, wordDifficulty: event.target.value as NigoichiWordDifficulty })} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2 text-white">
                    {(Object.entries(nigoichiWordDifficultyLabels) as [NigoichiWordDifficulty, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
              <p className="mt-2 rounded-lg bg-indigo-950/40 px-3 py-2 text-xs font-bold text-indigo-100">B = {roomConfigPlayerCount} × {room.cardsPerPlayer} + 1 = {roomTotalCards}枚。場に並ぶカード総数は最大21枚です。難易度分類は暫定版です。</p>
            </div>}
            {isHost && room.debugMode && <div className="mt-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-4"><p className="text-sm font-bold text-cyan-50">ダミーを最大募集人数まで追加し、ホスト1人で提出・予想・結果表示まで確認できます。</p><button type="button" disabled={isSaving || room.players.length >= room.playerCapacity} onClick={() => void runAction({ type: "debug-add-player", actorId: playerId })} className="mt-3 w-full rounded-lg bg-cyan-200 px-4 py-2 font-black text-cyan-950 disabled:opacity-40">ダミーユーザーを追加</button></div>}
            {isHost ? <button type="button" disabled={isSaving || (!room.debugMode && room.players.length < nigoichiMinimumPlayers)} onClick={() => void runAction({ type: "start-game", actorId: playerId })} className="mt-6 w-full rounded-xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950 disabled:opacity-40">{!room.debugMode && room.players.length < nigoichiMinimumPlayers ? "2人以上で開始できます" : "このメンバーで開始"}</button> : <p className="mt-5 text-center font-bold text-slate-300">ホストがゲームを開始するまでお待ちください。</p>}
          </section>}

          {room.phase !== "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">{room.phase === "clue" ? "連想語を入力" : room.phase === "guess" ? "余り番号を推理" : "答え合わせ"}</p><h2 className="mt-1 text-2xl font-black">場の言葉 {room.words.length}枚</h2></div><span className="rounded-xl bg-indigo-200 px-3 py-2 text-sm font-black text-indigo-950">{room.players.length}人 × {room.cardsPerPlayer} + 1</span></div><ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{room.words.map((word, index) => <li key={`${index}:${word}`} className={`flex items-center gap-3 rounded-xl border p-3 ${room.phase === "result" && index === room.missingNumber ? "border-rose-300 bg-rose-300/15" : "border-white/10 bg-white/[0.05]"}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white font-black text-slate-950">{index + 1}</span><span className="font-bold">{word}</span>{room.phase === "result" && index === room.missingNumber && <span className="ml-auto text-xs font-black text-rose-200">余り</span>}</li>)}</ol></section>}

          {room.phase === "clue" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">{room.cardsPerPlayer}枚から連想語を{room.associationWordCount}個書く</h2><p className="mt-1 text-sm text-slate-400">カードとの分類・対応付けは不要です・提出済み {submittedAssociations}/{room.players.length}人</p></div></div>
            <div className="mt-5 space-y-4">{controllablePlayers.map((player) => {
              const hand = room.hands[player.id];
              if (!hand) return null;
              const submitted = room.associations[player.id];
              const draft = associationDrafts[player.id] ?? [];
              const draftClues = Array.from({ length: room.associationWordCount }, (_, index) => (draft[index] ?? "").trim());
              const draftIsValid = areValidNigoichiAssociations(draftClues, room.associationWordCount);
              return <article key={player.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <p className="text-sm font-black text-indigo-200">{player.id === playerId ? "あなた" : `${player.name}（デバッグ操作）`}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">{hand.map((number) => <div key={number} className="rounded-xl border border-indigo-300/40 bg-indigo-300/10 p-4"><p className="text-xs font-black text-indigo-200">番号 {number + 1}</p><p className="mt-1 text-xl font-black">{room.words[number]}</p></div>)}</div>
                {submitted ? <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3 text-emerald-100"><p className="font-black">提出済み</p><p className="mt-1 text-sm">連想語：<strong>{submitted.join(" / ")}</strong></p></div> : <div className="mt-4">
                  <p className="text-sm font-bold">この手札全体から、連想語を自由に書いてください</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">{Array.from({ length: room.associationWordCount }, (_, index) => <label key={index} className="rounded-xl border border-white/10 bg-slate-950/50 p-3 text-xs font-bold text-slate-300">連想語 {index + 1}<input value={draft[index] ?? ""} maxLength={30} onChange={(event) => setAssociationDrafts((current) => { const clues = [...(current[player.id] ?? [])]; clues[index] = event.target.value; return { ...current, [player.id]: clues }; })} onKeyDown={(event) => { if (event.key === "Enter" && draftIsValid) submitAssociations(player.id); }} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-lg text-white outline-none focus:border-indigo-300" /></label>)}</div>
                  <button type="button" disabled={isSaving || !draftIsValid} onClick={() => submitAssociations(player.id)} className="mt-3 w-full rounded-xl bg-indigo-300 px-4 py-3 font-black text-indigo-950 disabled:opacity-40">連想語を提出</button>
                </div>}
              </article>;
            })}</div>
            <p className="mt-4 text-center text-sm text-slate-300">全員が提出すると連想語を一斉公開します。</p>
            {isHost && room.debugMode && <button type="button" onClick={() => void runAction({ type: "debug-fill-associations", actorId: playerId })} className="mt-4 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">デバッグ：未提出の連想語を自動入力</button>}
          </section>}

          {room.phase === "guess" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6">
            <h2 className="text-xl font-black">連想語から余り番号を探す</h2>
            <p className="mt-1 text-sm text-slate-400">自分に配られたカードは選べません・予想済み {submittedGuesses}/{room.players.length}人</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{room.players.map((player) => <div key={player.id} className="rounded-xl border border-white/10 bg-white/[0.05] p-4"><p className="text-xs font-bold text-slate-400">{player.name}</p><ol className="mt-2 space-y-1">{room.associations[player.id]?.map((clue, index) => <li key={index} className="font-black">{index + 1}. {clue}</li>)}</ol></div>)}</div>
            <div className="mt-5 space-y-4">{controllablePlayers.map((player) => {
              const guessed = room.guesses[player.id];
              return <fieldset key={player.id} className="rounded-xl border border-white/10 bg-white/[0.05] p-4">
                <legend className="px-2 font-black">{player.id === playerId ? "あなたの予想" : `${player.name}の予想（デバッグ操作）`}</legend>
                {guessed !== undefined
                  ? <p className="mt-2 font-black text-emerald-200">{guessed + 1}番を選択済み</p>
                  : <div className="mt-2 flex flex-wrap gap-2">{room.words.map((_, number) => {
                    const isOwnCard = nigoichiPlayerOwnsCard(room, player.id, number);
                    return <button key={number} type="button" disabled={isSaving || isOwnCard} title={isOwnCard ? "自分に配られたカードは選べません" : `${number + 1}番を選ぶ`} onClick={() => void runAction({ type: "submit-guess", actorId: playerId, playerId: player.id, number })} className={`grid h-11 w-11 place-items-center rounded-full border font-black transition ${isOwnCard ? "cursor-not-allowed border-rose-300/20 bg-rose-300/10 text-rose-200 opacity-45" : "border-white/20 bg-white/10 hover:bg-indigo-300 hover:text-indigo-950"}`}>{number + 1}</button>;
                  })}</div>}
              </fieldset>;
            })}</div>
            <p className="mt-4 text-center text-sm text-slate-300">全員が選ぶまで他人の予想は表示されません。</p>
            {isHost && room.debugMode && <button type="button" onClick={() => void runAction({ type: "debug-fill-guesses", actorId: playerId })} className="mt-4 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">デバッグ：未提出の予想を正解で自動入力</button>}
          </section>}

          {room.phase === "result" && room.missingNumber !== null && <section className="rounded-2xl border border-rose-300/30 bg-slate-950/80 p-6">
            <div className="text-center"><p className="text-sm font-black text-rose-200">答え合わせ</p><h2 className="mt-2 text-3xl font-black">余りは {room.missingNumber + 1}番「{room.words[room.missingNumber]}」</h2><p className="mt-3 text-slate-300">{room.players.length}人中{correctCount}人が正解しました。</p></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">{room.players.map((player) => {
              const hand = room.hands[player.id] ?? [];
              const correct = nigoichiGuessIsCorrect(room, player.id);
              const score = room.roundScores[player.id];
              return <article key={player.id} className={`rounded-xl border p-4 ${correct ? "border-emerald-300 bg-emerald-300/10" : "border-white/10 bg-white/[0.05]"}`}>
                <div className="flex items-center justify-between gap-3"><h3 className="font-black">{player.name}</h3><span className={`rounded-md px-2 py-1 text-xs font-black ${correct ? "bg-emerald-300 text-emerald-950" : "bg-slate-700 text-slate-200"}`}>{correct ? "正解" : "不正解"}</span></div>
                <p className="mt-3 text-sm text-slate-300">手札：{hand.map((number) => `${number + 1}.${room.words[number]}`).join(" / ")}</p>
                <p className="mt-3 rounded-lg bg-slate-950/50 p-2 text-sm text-slate-300">連想語：<strong className="text-white">{room.associations[player.id]?.join(" / ")}</strong></p>
                <p className="mt-3 text-sm text-slate-300">予想：{(room.guesses[player.id] ?? -1) + 1}番</p>
                {score && <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm">
                  <dt className="text-slate-400">余りを正解</dt><dd className="text-right font-black text-emerald-200">+{score.correctBonus}</dd>
                  <dt className="text-slate-400">自分のカードへの回答</dt><dd className="text-right font-black text-rose-200">−{score.receivedWrongVotes}</dd>
                  <dt className="font-bold">ラウンド得点</dt><dd className="text-right font-black">{score.roundScore >= 0 ? "+" : ""}{score.roundScore}</dd>
                  <dt className="font-bold text-indigo-200">累計得点</dt><dd className="text-right text-lg font-black text-indigo-200">{score.totalScoreAfterRound}</dd>
                </dl>}
              </article>;
            })}</div>
            {isHost ? <RoomResultActions disabled={isSaving} onPlayAgain={() => void runAction({ type: "reset-game", actorId: playerId })} onDissolve={() => void dissolveRoom()} /> : <p className="mt-5 text-center text-sm font-bold text-slate-300">ホストの操作を待っています。</p>}
          </section>}
          {room.phase === "result" && <GameResultShareButton title="ワードアウト プレイログ" text={nigoichiShareText(room)} url="/word-out" />}
          {room.phase === "clue" && !myHand && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold">あなたの手札を取得できませんでした。画面を再読み込みしてください。</p>}
        </div>
      </div>
    </main>
  );
}
