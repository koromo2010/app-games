"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DebugModeButton } from "@/app/components/DebugModeButton";
import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import { RoomResultActions } from "@/app/components/RoomResultActions";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "@/app/hooks/use-online-room-polling";
import { useRoomResultReturnGate } from "@/app/hooks/use-room-result-return-gate";
import { applyNorthernBranchRoomAction, createNorthernBranchRoom, northernBranchRoomApi } from "@/app/northern-branch/northern-branch-room-api-client";
import { northernBaseResources, northernBuildings, northernCards } from "@/lib/northern-branch-data";
import { northernRules } from "@/lib/northern-branch-game";
import { OnlineRoomApiError, restoreOnlineRoom } from "@/lib/online-room-api-client";
import type {
  NorthernGameAction,
  NorthernRoom,
  NorthernRoomAction,
  NorthernRoomChoice,
  NorthernRoomPlayer,
} from "@/lib/northern-branch-types";
import {
  defaultAvatarImage,
  fallbackAvatarColor,
  isPlayerAuthenticated,
  loadPersistentPlayerSession,
  type PlayerSession,
} from "@/lib/player-session";

const lastRoomKey = "northern-branch-last-room";
const ownerIdKey = "northern-branch-owner-id";

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

function apiMessage(status: number, fallback: string) {
  if (status === 401) return "合言葉が違います。";
  if (status === 403) return "今はあなたの手番ではないか、この操作を行う権限がありません。";
  if (status === 404) return "部屋が見つかりません。";
  if (status === 409) return "部屋が満員か、状態が更新されています。もう一度お試しください。";
  if (status === 503) return "部屋サーバーを利用できません。少し待ってお試しください。";
  return fallback;
}

function PlayerRow({ player, isHost, isMe }: { player: NorthernRoomPlayer; isHost: boolean; isMe: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl border p-3 ${isMe ? "border-lime-300 bg-lime-300/10" : "border-white/10 bg-white/[0.04]"}`}>
      <span
        className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-cover bg-center"
        style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate font-bold">{player.name}{isMe ? "（あなた）" : ""}</span>
      {player.isDummy && <span className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs font-black text-cyan-100">ダミー</span>}
      {isHost && <span className="rounded-md bg-amber-300 px-2 py-1 text-xs font-black text-slate-950">ホスト</span>}
    </li>
  );
}

export function NorthernBranchGame() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [room, setRoom] = useState<NorthernRoom | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [choices, setChoices] = useState<NorthernRoomChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [paymentSelection, setPaymentSelection] = useState<{ playerId: string; indexes: number[] }>({ playerId: "", indexes: [] });
  const [isSaving, setIsSaving] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const resultReturnGate = useRoomResultReturnGate({ room, setRoom, playerId: session?.id ?? "", resultPhase: "finished", onReturnUnavailable: () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。") });

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    if (!isPlayerAuthenticated()) {
      timer = window.setTimeout(() => setReady(true), 0);
      return () => {
        active = false;
        if (timer) window.clearTimeout(timer);
      };
    }
    loadPersistentPlayerSession().then(async (savedSession) => {
      if (!active) return;
      if (!savedSession?.id) {
        setReady(true);
        return;
      }
      setSession(savedSession);
      const lastCode = localStorage.getItem(lastRoomKey);
      const savedRoom = await restoreOnlineRoom({
        playerId: savedSession.id,
        lastCode,
        fetchActiveRoom: northernBranchRoomApi.fetchActiveRoom,
        fetchRoom: northernBranchRoomApi.fetchRoom,
      });
      if (!active) return;
      timer = window.setTimeout(() => {
        if (savedRoom) {
          setRoom(savedRoom);
          localStorage.setItem(lastRoomKey, savedRoom.code);
        }
        setReady(true);
      }, 0);
    }).catch(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const roomCode = room?.code;
  const roomPhase = room?.phase;
  const playerId = session?.id ?? "";

  useOnlineRoomPolling({
    roomCode: playerId && !resultReturnGate.isRoomDissolved ? roomCode : null,
    intervalMs: roomPhase === "lobby" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active,
    fetchRoom: (code) => northernBranchRoomApi.fetchRoom(code, playerId),
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

  const game = room?.game ?? null;
  const activePlayer = game?.players[game.activePlayerIndex];
  const paymentIndexes = paymentSelection.playerId === activePlayer?.id ? paymentSelection.indexes : [];

  const isHost = Boolean(room && playerId === room.hostId);
  const canControlTurn = Boolean(activePlayer && (activePlayer.id === playerId || (room?.debugMode && isHost)));
  const myGamePlayer = game?.players.find((player) => player.id === playerId);
  const handPlayer = canControlTurn ? activePlayer : myGamePlayer;
  const selectedValue = handPlayer
    ? paymentIndexes.reduce((sum, index) => sum + (northernCards[handPlayer.hand[index]]?.value ?? 0), 0)
    : 0;
  const winner = game?.players.find((player) => player.id === game.winnerId);
  const configItems = room ? [
    { label: "参加人数", value: `${room.players.length}/4人` },
    { label: "勝利条件", value: `${northernRules.victoryPoints}点` },
    { label: "手札上限", value: `${northernRules.handLimit}枚` },
    { label: "合言葉", value: room.passphrase ? "あり" : "なし" },
    { label: "デバッグ", value: room.debugMode ? "ON" : "OFF" },
  ] : [];

  const runAction = useCallback(async (action: NorthernRoomAction) => {
    if (!room) return null;
    setIsSaving(true);
    try {
      const savedRoom = await applyNorthernBranchRoomAction(room.code, action);
      setRoom(savedRoom);
      setError("");
      return savedRoom;
    } catch (caught) {
      const payload = caught instanceof OnlineRoomApiError && caught.payload && typeof caught.payload === "object" ? caught.payload as { error?: string } : null;
      setError(caught instanceof OnlineRoomApiError ? apiMessage(caught.status, payload?.error || "操作を保存できませんでした。") : "通信できませんでした。接続を確認してください。");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [room]);

  const perform = (action: NorthernGameAction) => {
    if (!room || !playerId) return;
    void runAction({ type: "game-action", actorId: playerId, action }).then((saved) => {
      if (saved && action.type !== "use-building") setPaymentSelection({ playerId: "", indexes: [] });
    });
  };

  const createRoom = async () => {
    if (!session?.id) return;
    setIsSaving(true);
    const ownerId = getOwnerId();
    try {
      await northernBranchRoomApi.remove({ ownerId, fallbackHostId: session.id });
      const now = Date.now();
      const host: NorthernRoomPlayer = { id: session.id, name: session.name, joinedAt: now, avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined };
      const nextRoom: NorthernRoom = {
        code: makeRoomCode(), revision: 0, hostId: session.id, ownerId, passphrase: passphrase.trim(), phase: "lobby",
        players: [host], gameNumber: 1, debugMode: false, debugReplayEnabled: false, game: null, notice: "参加者を待っています。", createdAt: now, updatedAt: now,
      };
      const data = await createNorthernBranchRoom(nextRoom, session.id);
      setRoom(data.room);
      localStorage.setItem(lastRoomKey, data.room.code);
      setError("");
    } catch (caught) {
      const status = caught instanceof OnlineRoomApiError ? caught.status : 0;
      setError(status === 409 ? "プレイ中の部屋があります。先にその部屋へ戻ってください。" : apiMessage(status, "部屋を作成できませんでした。"));
    } finally {
      setIsSaving(false);
    }
  };

  const listRooms = async () => {
    try {
      const rooms = await northernBranchRoomApi.fetchJoinableRooms();
      setChoices(rooms);
      setShowChoices(true);
      setError(rooms.length ? "" : "参加できる未開始の部屋がありません。");
    } catch (caught) {
      setError(apiMessage(caught instanceof OnlineRoomApiError ? caught.status : 0, "部屋一覧を取得できませんでした。"));
    }
  };

  const joinRoom = async (selectedCode = joinCode) => {
    if (!session?.id) return;
    const code = selectedCode.trim().toUpperCase();
    if (!code) {
      setError("部屋コードを入力してください。");
      return;
    }
    const player: NorthernRoomPlayer = { id: session.id, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined };
    setIsSaving(true);
    try {
      const joinedRoom = await applyNorthernBranchRoomAction(code, { type: "join-room", actorId: session.id, player, passphrase });
      setRoom(joinedRoom);
      setShowChoices(false);
      localStorage.setItem(lastRoomKey, joinedRoom.code);
      setError("");
    } catch (caught) {
      setError(apiMessage(caught instanceof OnlineRoomApiError ? caught.status : 0, "部屋へ参加できませんでした。"));
    } finally {
      setIsSaving(false);
    }
  };

  const dissolveRoom = async () => {
    if (!room || !session?.id || !isHost || !window.confirm("部屋を解散しますか？")) return;
    try {
      await northernBranchRoomApi.remove({ code: room.code, actorId: session.id });
    } catch {
      setError("部屋を解散できませんでした。");
      return;
    }
    localStorage.removeItem(lastRoomKey);
    if (resultReturnGate.markRoomDissolved()) {
      setError("部屋を解散しました。結果画面はこのまま確認できます。");
      return;
    }
    setRoom(null);
  };

  const leaveRoom = async () => {
    if (!room || !session?.id || isHost) return;
    const saved = await runAction({ type: "leave-room", actorId: session.id });
    if (!saved) return;
    setRoom(null);
    localStorage.removeItem(lastRoomKey);
  };

  const marketCards = game?.offers ?? [];
  const rulesDialog = <GameRulesDialog open={rulesOpen} title="ノーザンブランチのルール" onClose={() => setRulesOpen(false)}>
    <p>資源から価値の高い商品を作り、建物を増やして商会を成長させるゲームです。最初に10勝利点へ到達した人が勝ちます。</p>
    <h3 className="mt-4 font-black text-white">自分の番にすること</h3>
    <ol className="mt-2 list-decimal space-y-2 pl-5">
      <li>次の4つから、メインの行動を1つ選びます。「資源を1枚もらう」「手札の材料で市場の商品を作る」「手札を支払って商品を買う」「手札を支払って建物を建てる」のどれかです。</li>
      <li>自分の建物は、メインの行動とは別に使えます。使えるのは建物1軒につき自分の番に1回です。</li>
      <li>メインの行動を終えたら「手番終了」を押し、次の人へ交代します。</li>
    </ol>
    <h3 className="mt-4 font-black text-white">商品・建物・得点</h3>
    <ul className="mt-2 list-disc space-y-2 pl-5">
      <li>商品には必要な材料があります。手札に材料がそろっていると生産できます。</li>
      <li>商品や建物を買うときは、手札のカードに書かれた価値の合計で支払います。多く払いすぎてもお釣りはありません。</li>
      <li>建物を建てると勝利点を得て、それぞれの特別な能力も使えるようになります。同じ建物を2軒持つことはできません。</li>
    </ul>
    <h3 className="mt-4 font-black text-white">覚えておくこと</h3>
    <p className="mt-2">手札は最大7枚で、内容は本人にだけ見えます。豚か鶏を持って手番を終えると、空きがある場合はダングが1枚増えます。市場、建物、得点、現在の手番、行動履歴は全員に見えます。</p>
    <p className="mt-3 text-amber-200">現在は試作版のため、カードの種類や数値は今後変わることがあります。</p>
  </GameRulesDialog>;

  if (!ready) return <main className="min-h-screen bg-slate-950 p-8 text-white">ログイン情報と部屋を確認中...</main>;

  if (!session?.id) {
    return <main className="min-h-screen bg-slate-950 px-4 py-12 text-white"><div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center"><h1 className="text-3xl font-black">ノーザンブランチ</h1><p className="mt-4 leading-7 text-slate-300">このゲームはログインしたプレイヤー同士で遊びます。ゲームロビーでログインしてください。</p><Link href="/games" className="mt-6 inline-flex rounded-xl bg-lime-400 px-5 py-3 font-black text-lime-950">ゲームロビーへ</Link></div></main>;
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#365314_0%,#172033_42%,#020617_82%)] px-4 py-8 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between gap-2"><Link href="/games" className="text-sm font-bold text-lime-200">← ゲームロビー</Link><div className="flex items-center gap-2"><button type="button" onClick={() => setRulesOpen(true)} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold">ルール</button><span className="text-sm font-bold">{session.name}</span></div></div>
          <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl">
            <div className="bg-gradient-to-r from-lime-400 via-amber-300 to-orange-400 px-6 py-8 text-slate-950"><p className="text-xs font-black uppercase tracking-[0.28em]">Online room game</p><h1 className="mt-2 text-4xl font-black sm:text-6xl">ノーザンブランチ</h1><p className="mt-3 font-bold">資源を商品へ育て、建物を増やし、最初に10点を目指す手番制ゲーム。</p></div>
            <div className="grid gap-6 p-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋を作る</h2><p className="mt-2 text-sm leading-6 text-slate-400">あなたがホストになり、参加者を集めて開始します。</p><label className="mt-4 block text-sm font-bold">合言葉（任意）<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><button type="button" disabled={isSaving} onClick={createRoom} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">新しい部屋を作る</button></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋に参加</h2><label className="mt-4 block text-sm font-bold">部屋コード<input value={joinCode} maxLength={4} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-lg uppercase text-white outline-none" /></label><label className="mt-3 block text-sm font-bold">合言葉<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={isSaving} onClick={() => void joinRoom()} className="rounded-xl bg-lime-400 px-3 py-3 font-black text-lime-950 disabled:opacity-50">コードで参加</button><button type="button" onClick={() => void listRooms()} className="rounded-xl border border-white/20 px-3 py-3 font-black">部屋一覧</button></div></div>
            </div>
            {showChoices && <div className="border-t border-white/10 p-6"><h2 className="font-black">参加できる部屋</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{choices.map((choice) => <button key={choice.code} type="button" onClick={() => { setJoinCode(choice.code); void joinRoom(choice.code); }} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 text-left"><span className="font-mono text-lg font-black text-lime-300">{choice.code}</span><span className="ml-3 font-bold">{choice.hostName}</span><span className="mt-1 block text-xs text-slate-400">{choice.playerCount}/4人・合言葉{choice.hasPassphrase ? "あり" : "なし"}</span></button>)}</div></div>}
            {error && <p className="mx-6 mb-6 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          </section>
        </div>
        <GameAdSlot gameId="northern-branch" surface="game-entry" />
        {rulesDialog}
      </main>
    );
  }

  return (
    <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#365314_0%,#172033_35%,#020617_75%)] text-white ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow="Trading company strategy" title={<>ノーザンブランチ <span className="font-mono text-base text-amber-300">#{room.code}</span></>}>
        {room.phase === "lobby" && (isHost
          ? <button type="button" onClick={() => void dissolveRoom()} className={gameTopBannerDangerActionClass}>部屋を解散</button>
          : <Link href="/games" className={gameTopBannerActionClass}>ゲームロビーへ戻る</Link>)}
        <GameTopMenu>
          {room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>ゲームロビーへ戻る</Link>}
          <button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button>
          {isHost && <DebugModeButton enabled={room.debugMode} disabled={isSaving || room.phase !== "lobby"} onAbort={room.debugMode && room.phase !== "lobby" ? () => runAction({ type: "abort-game", actorId: playerId }).then(() => undefined) : undefined} replayEnabled={room.debugReplayEnabled} replayDisabled={isSaving} onReplayChange={(enabled) => runAction({ type: "set-debug-replay", actorId: playerId, enabled }).then(() => undefined)} onChange={(enabled) => runAction({ type: "set-debug", actorId: playerId, enabled }).then(() => undefined)} />}
          {room.phase === "lobby" && !isHost && <button type="button" data-menu-close="true" onClick={() => void leaveRoom()} className={gameTopMenuItemClass}>退出</button>}
        </GameTopMenu>
        <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
      </GameTopBanner>
      <GameAdSlot
        gameId="northern-branch"
        surface={room.phase === "lobby" ? "room-lobby" : room.phase === "finished" ? "result" : null}
        disabled={room.debugMode}
      />
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
        <aside className="space-y-4"><section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between"><h2 className="font-black">参加者</h2><span className="text-sm text-slate-400">{room.players.length}/4人</span></div><ul className="mt-3 space-y-2">{room.players.map((player) => <PlayerRow key={player.id} player={player} isHost={player.id === room.hostId} isMe={player.id === playerId} />)}</ul></section><RoomConfigSummary items={configItems} /></aside>
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          {room.notice && <p className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-sm font-bold text-cyan-50">{room.notice}</p>}
          {room.phase === "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">ゲーム開始前</h2><p className="mt-3 rounded-xl bg-white/[0.05] p-4 text-sm leading-6 text-slate-300">2〜4人で遊びます。開始後は各自の手札が本人の端末だけに表示され、手番のプレイヤーだけが行動できます。</p>{isHost && room.debugMode && <div className="mt-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-4"><p className="text-sm font-bold text-cyan-50">デバッグ用の参加者を追加し、ホスト1人で手番を切り替えながら確認できます。</p><button type="button" disabled={isSaving || room.players.length >= 4} onClick={() => void runAction({ type: "debug-add-player", actorId: playerId })} className="mt-3 w-full rounded-lg border border-cyan-200/40 bg-cyan-200 px-4 py-2 font-black text-cyan-950 disabled:opacity-40">ダミーユーザーを追加</button></div>}{isHost ? <button type="button" disabled={isSaving || room.players.length < 2} onClick={() => void runAction({ type: "start-game", actorId: playerId })} className="mt-6 w-full rounded-xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950 disabled:opacity-40">{room.players.length < 2 ? "2人以上で開始できます" : "このメンバーで開始"}</button> : <p className="mt-5 text-center font-bold text-slate-300">ホストがゲームを開始するまでお待ちください。</p>}</section>}

          {game && <>
            <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-lime-300">第{game.turn}巡目</p><h2 className="mt-1 text-2xl font-black">{activePlayer?.name}の手番</h2></div><span className={`rounded-xl px-4 py-2 text-sm font-black ${canControlTurn ? "bg-lime-400 text-lime-950" : "bg-white/10 text-slate-300"}`}>{canControlTurn ? "操作できます" : "手番を待っています"}</span></div>{room.debugMode && isHost && activePlayer?.id !== playerId && <p className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm font-bold text-cyan-50">デバッグ中：ホストが{activePlayer?.name}の手番を操作しています。</p>}</section>
            {winner && <section className="rounded-2xl border border-amber-300 bg-amber-300/15 p-6 text-center"><p className="text-sm font-bold text-amber-200">GAME FINISHED</p><p className="mt-2 text-3xl font-black">{winner.name}の勝利！</p><RoomResultActions canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={isSaving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : () => resultReturnGate.returnToRoom((code) => northernBranchRoomApi.fetchRoom(code, playerId), () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"))} onDissolve={isHost ? dissolveRoom : undefined} /></section>}
            <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><div><p className="text-xs font-bold uppercase text-cyan-300">Market</p><h2 className="text-xl font-black">市場の商品と建物</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{marketCards.map((offer) => { const item = offer.kind === "product" ? northernCards[offer.cardId] : northernBuildings[offer.buildingId]; const cost = offer.kind === "product" ? northernCards[offer.cardId].value : northernBuildings[offer.buildingId].cost; const recipe = offer.kind === "product" ? Object.entries(northernCards[offer.cardId].recipe ?? {}).map(([id, count]) => `${northernCards[id as keyof typeof northernCards].name}×${count}`).join("・") : ""; return <article key={offer.id} className="rounded-xl border border-white/10 bg-slate-900 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-slate-400">{offer.kind === "product" ? "商品" : "建物"}</p><h3 className="font-black">{item.name}</h3></div><span className="rounded-md bg-amber-300 px-2 py-1 text-xs font-black text-amber-950">価値 {cost}</span></div>{offer.kind === "product" ? <p className="mt-2 min-h-10 text-xs text-slate-300">生産：{recipe}</p> : <p className="mt-2 min-h-10 text-xs text-slate-300">{northernBuildings[offer.buildingId].description} / {northernBuildings[offer.buildingId].points}点</p>}<div className="mt-3 flex gap-2">{offer.kind === "product" && <button type="button" disabled={!canControlTurn || game.mainActionUsed || room.phase === "finished" || isSaving} onClick={() => perform({ type: "produce", offerId: offer.id })} className="flex-1 rounded-lg bg-cyan-600 px-2 py-2 text-xs font-bold disabled:opacity-30">生産</button>}<button type="button" disabled={!canControlTurn || game.mainActionUsed || room.phase === "finished" || isSaving} onClick={() => perform({ type: "buy", offerId: offer.id, paymentIndexes })} className="flex-1 rounded-lg bg-amber-500 px-2 py-2 text-xs font-bold text-amber-950 disabled:opacity-30">売買</button></div></article>; })}</div></section>
            <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-lime-300">Main action</p><h2 className="text-xl font-black">資源を1枚得る</h2></div><span className={`rounded-lg px-3 py-2 text-xs font-bold ${game.mainActionUsed ? "bg-slate-700 text-slate-300" : "bg-lime-300 text-lime-950"}`}>{game.mainActionUsed ? "使用済み" : "選択可能"}</span></div><div className="mt-4 flex flex-wrap gap-2">{northernBaseResources.map((cardId) => <button key={cardId} type="button" disabled={!canControlTurn || game.mainActionUsed || room.phase === "finished" || isSaving} onClick={() => perform({ type: "take-resource", cardId })} className={`rounded-lg px-3 py-2 text-sm font-black disabled:opacity-30 ${northernCards[cardId].color}`}>{northernCards[cardId].name}</button>)}</div></section>
            <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-amber-300">Private hand</p><h2 className="text-xl font-black">{handPlayer?.name}の手札</h2></div><p className="text-sm font-bold text-amber-200">選択価値 {selectedValue}</p></div><p className="mt-2 text-xs text-slate-400">売買に使うカードを選びます。他のプレイヤーには内容が送信されません。</p><div className="mt-3 flex flex-wrap gap-2">{handPlayer?.hand.map((cardId, index) => { const card = northernCards[cardId]; const selected = paymentIndexes.includes(index); return <button key={`${cardId}-${index}`} type="button" disabled={!canControlTurn || isSaving} aria-pressed={selected} onClick={() => setPaymentSelection((current) => { const indexes = current.playerId === handPlayer.id ? current.indexes : []; return { playerId: handPlayer.id, indexes: selected ? indexes.filter((item) => item !== index) : [...indexes, index] }; })} className={`min-w-24 rounded-xl border p-3 text-left transition disabled:opacity-50 ${selected ? "border-cyan-300 ring-2 ring-cyan-300/40" : "border-white/10"} ${card.color}`}><span className="block text-xs font-bold opacity-70">{card.kind}</span><span className="block font-black">{card.name}</span><span className="block text-xs font-bold">価値 {card.value}</span></button>; })}</div>{!canControlTurn && <p className="mt-4 rounded-lg bg-white/[0.05] p-3 text-sm text-slate-300">自分の手札はいつでも確認できます。手番が来るとカードを選んで行動できます。</p>}</section>
            <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><div><p className="text-xs font-bold uppercase text-violet-300">Building actions</p><h2 className="text-xl font-black">{handPlayer?.name}の建物</h2></div>{handPlayer?.buildings.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{handPlayer.buildings.map((buildingId) => { const building = northernBuildings[buildingId]; const used = handPlayer.usedBuildings.includes(buildingId); return <article key={buildingId} className="rounded-xl border border-white/10 bg-slate-900 p-3"><div className="flex items-start justify-between gap-2"><h3 className="font-black">{building.name}</h3><span className="text-sm font-black text-amber-300">{building.points}点</span></div><p className="mt-2 min-h-10 text-xs text-slate-300">{building.description}</p><button type="button" disabled={!canControlTurn || used || room.phase === "finished" || isSaving} onClick={() => perform({ type: "use-building", buildingId })} className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold disabled:bg-slate-700 disabled:text-slate-400">{used ? "使用済み" : building.actionLabel}</button></article>; })}</div> : <p className="mt-3 rounded-lg bg-black/20 p-4 text-sm text-slate-400">まだ建物がありません。市場から購入できます。</p>}</section>
            <button type="button" disabled={!canControlTurn || !game.mainActionUsed || room.phase === "finished" || isSaving} onClick={() => perform({ type: "end-turn" })} className="w-full rounded-xl bg-lime-400 px-4 py-4 text-lg font-black text-lime-950 transition hover:bg-lime-300 disabled:bg-slate-700 disabled:text-slate-400">手番を終了して次の人へ</button>
          </>}
        </div>
        <aside className="space-y-3">{game && <><section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><p className="text-xs font-bold uppercase text-amber-300">Scores</p><div className="mt-3 space-y-2">{game.players.map((player, index) => <div key={player.id} className={`rounded-lg border p-3 ${index === game.activePlayerIndex ? "border-lime-300 bg-lime-300/10" : "border-white/10 bg-black/10"}`}><div className="flex items-center justify-between gap-2"><p className="truncate font-bold">{player.name}</p><p className="font-black text-amber-300">{player.points}点</p></div><p className="mt-1 text-xs text-slate-400">手札 {player.handCount ?? player.hand.length}/{northernRules.handLimit}・建物 {player.buildings.length}</p></div>)}</div></section><section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><p className="font-black">行動履歴</p><ul className="mt-3 space-y-2">{game.log.slice(0, 12).map((entry, index) => <li key={`${entry}-${index}`} className="border-b border-white/5 pb-2 text-xs leading-5 text-slate-300">{entry}</li>)}</ul></section></>}</aside>
      </div>
      {rulesDialog}
    </main>
  );
}
