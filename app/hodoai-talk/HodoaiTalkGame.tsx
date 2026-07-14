"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DebugModeButton } from "@/app/components/DebugModeButton";
import { GamePhaseTimer } from "@/app/components/GamePhaseTimer";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import { RoomResultActions } from "@/app/components/RoomResultActions";
import { RoomTimeLimitControl } from "@/app/components/RoomTimeLimitControl";
import { loadPlayerRoomDefaults, savePlayerRoomDefaults } from "@/lib/game-room-defaults-client";
import {
  defaultAvatarImage,
  fallbackAvatarColor,
  isPlayerAuthenticated,
  loadPersistentPlayerSession,
  type PlayerSession,
} from "@/lib/player-session";
import {
  clueHasNumber,
  hodoaiGameShareText,
  hodoaiFinalMessage,
  normalizeHodoaiConfig,
  type HodoaiConfig,
  type HodoaiPlayer,
  type HodoaiRoom,
  type HodoaiRoomAction,
  type HodoaiRoomChoice,
} from "@/lib/hodoai-talk";

const lastRoomKey = "hodoai-last-room";
const defaultsStorageKey = "hodoai-room-defaults-v2";
const ownerIdKey = "hodoai-owner-id";

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

function normalizeDefaults(value: unknown) {
  return { ...normalizeHodoaiConfig(value), debugMode: false };
}

function formatTime(seconds: number) {
  return seconds === 0 ? "なし" : `${seconds}秒`;
}

function apiMessage(status: number, fallback: string) {
  if (status === 401) return "合言葉が違います。";
  if (status === 403) return "この操作を行う権限がありません。";
  if (status === 404) return "部屋が見つかりません。";
  if (status === 409) return "部屋の状態が更新されました。もう一度お試しください。";
  if (status === 503) return "部屋サーバーを利用できません。少し待ってお試しください。";
  return fallback;
}

async function loadRoom(code: string, playerId: string) {
  const params = new URLSearchParams({ code, playerId });
  const response = await fetch(`/api/hodoai/rooms?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { room?: HodoaiRoom };
  return data.room ?? null;
}

async function loadActiveRoom(playerId: string) {
  const response = await fetch(`/api/hodoai/rooms?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { room?: HodoaiRoom | null };
  return data.room ?? null;
}

function PlayerRow({ player, isHost, isMe }: { player: HodoaiPlayer; isHost: boolean; isMe: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl border p-3 ${isMe ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-white/[0.04]"}`}>
      <span className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-cover bg-center" style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-bold">{player.name}{isMe ? "（あなた）" : ""}</span>
      {player.isDummy && <span className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs font-black text-cyan-100">ダミー</span>}
      {isHost && <span className="rounded-md bg-amber-300 px-2 py-1 text-xs font-black text-slate-950">ホスト</span>}
    </li>
  );
}

export function HodoaiTalkGame() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [room, setRoom] = useState<HodoaiRoom | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [choices, setChoices] = useState<HodoaiRoomChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [clueDrafts, setClueDrafts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

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
      const activeRoom = await loadActiveRoom(savedSession.id);
      const savedRoom = activeRoom ?? (lastCode ? await loadRoom(lastCode, savedSession.id) : null);
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

  useEffect(() => {
    if (!roomCode || !roomPhase || !playerId) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadRoom(roomCode, playerId).then((latest) => {
        if (!latest) {
          setRoom(null);
          localStorage.removeItem(lastRoomKey);
          setError("部屋が解散されたか、参加情報がなくなりました。");
          return;
        }
        setRoom((current) => current?.revision === latest.revision ? current : latest);
      });
    };
    const interval = window.setInterval(refresh, roomPhase === "lobby" || roomPhase === "result" ? 5000 : 2000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [playerId, roomCode, roomPhase]);

  const isHost = Boolean(room && playerId === room.hostId);
  const submittedCount = room ? room.cards.filter((card) => Boolean(room.clues[card.id])).length : 0;
  const orderedCards = useMemo(() => {
    if (!room) return [];
    return room.order.flatMap((id) => {
      const card = room.cards.find((item) => item.id === id);
      const player = card ? room.players.find((item) => item.id === card.ownerId) : null;
      return card && player ? [{ card, player }] : [];
    });
  }, [room]);
  const latestResult = room?.history.at(-1);
  const ownCards = room?.cards.filter((card) => card.ownerId === playerId) ?? [];
  const configItems = room ? [
    { label: "参加人数", value: `${room.players.length}人` },
    { label: "配るカード", value: `1人${room.cardsPerPlayer}枚` },
    { label: "ことば", value: `同じカードで${room.roundsTotal}回` },
    { label: "ヒント時間", value: formatTime(room.clueTimeLimitSeconds) },
    { label: "相談時間", value: formatTime(room.arrangeTimeLimitSeconds) },
    { label: "合言葉", value: room.passphrase ? "あり" : "なし" },
    { label: "デバッグ", value: room.debugMode ? "ON" : "OFF" },
  ] : [];

  const runAction = useCallback(async (action: HodoaiRoomAction) => {
    if (!room) return null;
    setIsSaving(true);
    try {
      const response = await fetch("/api/hodoai/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: room.code, action }),
      });
      if (!response.ok) {
        setError(apiMessage(response.status, "操作を保存できませんでした。"));
        return null;
      }
      const data = (await response.json()) as { room: HodoaiRoom };
      setRoom(data.room);
      setError("");
      return data.room;
    } catch {
      setError("通信できませんでした。接続を確認してください。");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [room]);

  const createRoom = async () => {
    if (!session?.id) return;
    setIsSaving(true);
    const ownerId = getOwnerId();
    try {
      const deleteResponse = await fetch(`/api/hodoai/rooms?ownerId=${encodeURIComponent(ownerId)}&fallbackHostId=${encodeURIComponent(session.id)}`, { method: "DELETE" });
      if (!deleteResponse.ok) {
        setError(deleteResponse.status === 409 ? "プレイ中の部屋があります。先にその部屋へ戻ってください。" : "以前の部屋を整理できませんでした。");
        return;
      }
      const defaults = await loadPlayerRoomDefaults({ game: "hodoai-talk", playerId: session.id, localStorageKey: defaultsStorageKey, normalize: normalizeDefaults });
      const now = Date.now();
      const host: HodoaiPlayer = { id: session.id, name: session.name, joinedAt: now, avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined };
      const nextRoom: HodoaiRoom = {
        code: makeRoomCode(), revision: 0, hostId: session.id, ownerId, passphrase: passphrase.trim(), phase: "lobby", players: [host],
        ...defaults, debugMode: false, debugReplayEnabled: false, debugLog: [], gameNumber: 1, round: 1, theme: null, cards: [], values: {}, clues: {}, clueHistory: [], order: [], totalPoints: 0, history: [], phaseStartedAt: null, createdAt: now, updatedAt: now,
      };
      const response = await fetch("/api/hodoai/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: nextRoom, actorId: session.id }) });
      if (!response.ok) {
        setError(apiMessage(response.status, "部屋を作成できませんでした。"));
        return;
      }
      const data = (await response.json()) as { room: HodoaiRoom };
      setRoom(data.room);
      localStorage.setItem(lastRoomKey, data.room.code);
      setError("");
    } catch {
      setError("部屋を作成できませんでした。");
    } finally {
      setIsSaving(false);
    }
  };

  const listRooms = async () => {
    const response = await fetch("/api/hodoai/rooms", { cache: "no-store" });
    if (!response.ok) {
      setError(apiMessage(response.status, "部屋一覧を取得できませんでした。"));
      return;
    }
    const data = (await response.json()) as { rooms?: HodoaiRoomChoice[] };
    setChoices(data.rooms ?? []);
    setShowChoices(true);
    setError(data.rooms?.length ? "" : "参加できる未開始の部屋がありません。");
  };

  const joinRoom = async (selectedCode = joinCode) => {
    if (!session?.id) return;
    const code = selectedCode.trim().toUpperCase();
    if (!code) {
      setError("部屋コードを入力してください。");
      return;
    }
    const player: HodoaiPlayer = { id: session.id, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined };
    setIsSaving(true);
    try {
      const response = await fetch("/api/hodoai/rooms", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, action: { type: "join-room", actorId: session.id, player, passphrase } satisfies HodoaiRoomAction }) });
      if (!response.ok) {
        setError(apiMessage(response.status, "部屋へ参加できませんでした。"));
        return;
      }
      const data = (await response.json()) as { room: HodoaiRoom };
      setRoom(data.room);
      setShowChoices(false);
      localStorage.setItem(lastRoomKey, data.room.code);
      setError("");
    } catch {
      setError("部屋へ参加できませんでした。");
    } finally {
      setIsSaving(false);
    }
  };

  const dissolveRoom = async () => {
    if (!room || !session?.id || !isHost || !window.confirm("部屋を解散しますか？")) return;
    const response = await fetch(`/api/hodoai/rooms?code=${encodeURIComponent(room.code)}&actorId=${encodeURIComponent(session.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setError("部屋を解散できませんでした。");
      return;
    }
    setRoom(null);
    localStorage.removeItem(lastRoomKey);
  };

  const leaveRoom = async () => {
    if (!room || !session?.id || isHost) return;
    const saved = await runAction({ type: "leave-room", actorId: session.id });
    if (!saved) return;
    setRoom(null);
    localStorage.removeItem(lastRoomKey);
  };

  const updateConfig = async (updates: Partial<Omit<HodoaiConfig, "debugMode">>) => {
    if (!room || !session?.id || !isHost) return;
    const config = normalizeHodoaiConfig({ ...room, ...updates, debugMode: room.debugMode });
    const saved = await runAction({ type: "update-config", actorId: session.id, config: { roundsTotal: config.roundsTotal, cardsPerPlayer: config.cardsPerPlayer, clueTimeLimitSeconds: config.clueTimeLimitSeconds, arrangeTimeLimitSeconds: config.arrangeTimeLimitSeconds } });
    if (saved) void savePlayerRoomDefaults({ game: "hodoai-talk", playerId: session.id, localStorageKey: defaultsStorageKey, defaults: normalizeDefaults(saved) });
  };

  const moveClue = (index: number, direction: -1 | 1) => {
    if (!room || !session?.id || !isHost) return;
    const target = index + direction;
    if (target < 0 || target >= room.order.length) return;
    const order = [...room.order];
    [order[index], order[target]] = [order[target], order[index]];
    void runAction({ type: "reorder", actorId: session.id, round: room.round, order });
  };

  const submitClue = (cardId: string) => {
    if (!room || !session?.id) return;
    const text = (clueDrafts[cardId] ?? "").trim();
    if (text.length < 2) {
      setError("ヒントを2文字以上で入力してください。");
      return;
    }
    if (clueHasNumber(text)) {
      setError("数字そのものはヒントに使えません。");
      return;
    }
    void runAction({ type: "submit-clue", actorId: session.id, round: room.round, cardId, text }).then((saved) => {
      if (saved) setClueDrafts((current) => ({ ...current, [cardId]: "" }));
    });
  };

  const rulesDialog = <GameRulesDialog open={rulesOpen} title="ワードスケールのルール" onClose={() => setRulesOpen(false)}>
    <p>全員に秘密の数字カードが配られます。数字を直接言わず、お題に合うことばだけを手がかりにして、全員のカードを小さい順に並べる協力ゲームです。</p>
    <h3 className="mt-4 font-black text-white">ゲームの準備</h3>
    <ul className="mt-2 list-disc space-y-2 pl-5">
      <li>1人に配るカードの枚数と、同じカードについてことばを出す回数を、部屋を作った人が設定します。</li>
      <li>ゲーム開始時に、設定枚数の数字カードが1人ずつに配られます。自分の数字は本人だけが確認できます。</li>
    </ul>
    <h3 className="mt-4 font-black text-white">ゲームの流れ</h3>
    <ol className="mt-2 list-decimal space-y-2 pl-5">
      <li>全員共通のお題が表示されます。自分の数字が小さいほど小さく、大きいほど大きく感じられる、お題に合ったことばを考えます。</li>
      <li>自分のカードごとに、手がかりとなることばを1つ提出します。数字そのものや、数を直接説明する表現は使えません。</li>
      <li>設定回数が2回以上なら、数字カードはそのままでお題だけが変わります。同じ数字について別のお題でもう一度ことばを出します。</li>
      <li>すべてのことばがそろったら、全員で相談します。ホストがカードを動かし、数字が小さいと思うカードから順に並べます。</li>
      <li>並び順を決定すると、最後に数字を1度だけ公開して採点します。</li>
    </ol>
    <h3 className="mt-4 font-black text-white">得点</h3>
    <p className="mt-2">正しい順番と比べ、前後が逆になっているカードの組み合わせを数えます。逆の組み合わせが0組なら3点、1組なら2点、2〜3組なら1点、4組以上なら0点です。この1回の採点がゲームの最終成績になります。</p>
    <p className="mt-4 text-amber-200">ことばの提出が時間切れになった人は、その回だけパスになります。並べ替えが時間切れになると、その時点の並び順で自動採点します。</p>
  </GameRulesDialog>;

  if (!ready) return <main className="min-h-screen bg-slate-950 p-8 text-white">ログイン情報と部屋を確認中...</main>;

  if (!session?.id) {
    return <main className="min-h-screen bg-slate-950 px-4 py-12 text-white"><div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center"><h1 className="text-3xl font-black">ワードスケール</h1><p className="mt-4 leading-7 text-slate-300">このゲームはログインしたプレイヤー同士で遊びます。ゲームロビーでログインしてください。</p><Link href="/games" className="mt-6 inline-flex rounded-xl bg-cyan-400 px-5 py-3 font-black text-cyan-950">ゲームロビーへ</Link></div></main>;
  }

  if (!room) {
    return (
      <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#164e63_0%,#1e293b_42%,#020617_82%)] px-4 pb-8 text-white ${gameTopBannerOffsetClass}`}>
        <GameTopBanner eyebrow="Online cooperative game" title="ワードスケール">
          <Link href="/games" className={gameTopBannerActionClass}>ゲームロビーへ戻る</Link>
          <GameTopMenu>
            <button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button>
          </GameTopMenu>
          <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
        </GameTopBanner>
        <div className="mx-auto max-w-4xl">
          <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl">
            <div className="bg-gradient-to-r from-sky-400 via-amber-300 to-fuchsia-400 px-6 py-8 text-slate-950"><p className="text-xs font-black uppercase tracking-[0.28em]">Online room game</p><h1 className="mt-2 text-4xl font-black sm:text-6xl">ワードスケール</h1><p className="mt-3 font-bold">配られた数字カードを指定テーマのことばで表し、全カードを小さい順に並べる協力ゲーム。</p></div>
            <div className="grid gap-6 p-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋を作る</h2><p className="mt-2 text-sm leading-6 text-slate-400">あなたがホストになり、設定と進行を管理します。</p><label className="mt-4 block text-sm font-bold">合言葉（任意）<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><button type="button" disabled={isSaving} onClick={createRoom} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">新しい部屋を作る</button></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋に参加</h2><label className="mt-4 block text-sm font-bold">部屋コード<input value={joinCode} maxLength={4} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-lg uppercase text-white outline-none" /></label><label className="mt-3 block text-sm font-bold">合言葉<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={isSaving} onClick={() => void joinRoom()} className="rounded-xl bg-cyan-400 px-3 py-3 font-black text-cyan-950 disabled:opacity-50">コードで参加</button><button type="button" onClick={() => void listRooms()} className="rounded-xl border border-white/20 px-3 py-3 font-black">部屋一覧</button></div></div>
            </div>
            {showChoices && <div className="border-t border-white/10 p-6"><h2 className="font-black">参加できる部屋</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{choices.map((choice) => <button key={choice.code} type="button" onClick={() => { setJoinCode(choice.code); void joinRoom(choice.code); }} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 text-left"><span className="font-mono text-lg font-black text-cyan-300">{choice.code}</span><span className="ml-3 font-bold">{choice.hostName}</span><span className="mt-1 block text-xs text-slate-400">{choice.playerCount}人・1人{choice.cardsPerPlayer}枚・ことば{choice.roundsTotal}回・合言葉{choice.hasPassphrase ? "あり" : "なし"}</span></button>)}</div></div>}
            {error && <p className="mx-6 mb-6 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          </section>
        </div>
        {rulesDialog}
      </main>
    );
  }

  return (
    <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#0e7490_0%,#172033_35%,#020617_75%)] text-white ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow="Online cooperative game" title={<>ワードスケール <span className="font-mono text-base text-amber-300">#{room.code}</span></>}>
        {room.phase === "lobby" && (isHost
          ? <button type="button" onClick={() => void dissolveRoom()} className={gameTopBannerDangerActionClass}>部屋を解散</button>
          : <Link href="/games" className={gameTopBannerActionClass}>ゲームロビーへ戻る</Link>)}
        <GameTopMenu>
          {room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>ゲームロビーへ戻る</Link>}
          <button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button>
          {isHost && <DebugModeButton enabled={room.debugMode} disabled={isSaving || room.phase !== "lobby"} onAbort={room.debugMode && room.phase !== "lobby" ? () => runAction({ type: "abort-game", actorId: playerId }).then(() => undefined) : undefined} replayEnabled={room.debugReplayEnabled} replayDisabled={isSaving} onReplayChange={(enabled) => runAction({ type: "set-debug-replay", actorId: playerId, enabled }).then(() => undefined)} debugLogEntries={room.debugLog} onChange={(enabled) => runAction({ type: "set-debug", actorId: playerId, enabled }).then(() => undefined)} />}
          {room.phase === "lobby" && !isHost && <button type="button" data-menu-close="true" onClick={() => void leaveRoom()} className={gameTopMenuItemClass}>退出</button>}
        </GameTopMenu>
        <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
      </GameTopBanner>
      {rulesDialog}
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4"><section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between"><h2 className="font-black">参加者</h2><span className="text-sm text-slate-400">{room.players.length}人</span></div><ul className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-1">{room.players.map((player) => <PlayerRow key={player.id} player={player} isHost={player.id === room.hostId} isMe={player.id === playerId} />)}</ul></section><RoomConfigSummary items={configItems} /></aside>
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          {room.phase === "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">ゲーム開始前</h2>{isHost ? <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">同じカードでことばを出す回数<select value={room.roundsTotal} onChange={(event) => void updateConfig({ roundsTotal: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950">{[1,2,3,4].map((value) => <option key={value} value={value}>{value}回</option>)}</select></label><label className="text-sm font-bold">1人に配るカード<select value={room.cardsPerPlayer} onChange={(event) => void updateConfig({ cardsPerPlayer: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950">{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}枚</option>)}</select></label><div className="sm:row-span-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50">数字カードはゲーム開始時に1度だけ配ります。同じカードについて、お題を変えながら設定回数ぶんことばを出し、最後に全カードを1度だけ並べます。</div><RoomTimeLimitControl label="1回ごとのことば提出時間" value={room.clueTimeLimitSeconds} onChange={(seconds) => void updateConfig({ clueTimeLimitSeconds: seconds })} /><RoomTimeLimitControl label="並べ替え相談時間" value={room.arrangeTimeLimitSeconds} onChange={(seconds) => void updateConfig({ arrangeTimeLimitSeconds: seconds })} /></div> : <p className="mt-4 rounded-xl bg-white/[0.05] p-4 text-slate-300">ホストが設定してゲームを開始するまでお待ちください。</p>}{isHost && room.debugMode && <div className="mt-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-4"><p className="text-sm font-bold text-cyan-50">デバッグ用の参加者を追加し、1人でも複数人プレイを確認できます。</p><button type="button" disabled={isSaving} onClick={() => void runAction({ type: "debug-add-player", actorId: playerId })} className="mt-3 w-full rounded-lg border border-cyan-200/40 bg-cyan-200 px-4 py-2 font-black text-cyan-950 disabled:opacity-50">ダミーユーザーを追加</button></div>} {isHost && <button type="button" disabled={isSaving || (room.players.length < 2 && !room.debugMode)} onClick={() => void runAction({ type: "start-game", actorId: playerId })} className="mt-6 w-full rounded-xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950 disabled:opacity-40">{room.players.length < 2 && !room.debugMode ? "2人以上で開始できます" : "このメンバーで開始"}</button>}</section>}

          {room.phase !== "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">{room.phase === "clue" ? `ことば ${room.round}/${room.roundsTotal}回目` : room.phase === "arrange" ? "最終並べ替え" : "最終結果"}</p><h2 className="mt-2 text-2xl font-black sm:text-4xl">{room.phase === "clue" ? room.theme?.title : room.phase === "arrange" ? "すべてのことばを手がかりに並べる" : `${room.totalPoints}/3点`}</h2></div><span className="rounded-xl bg-amber-300 px-4 py-2 font-black text-slate-950">全 {room.cards.length}枚</span></div>{room.phase === "clue" && room.theme && <div className="mt-5"><div className="h-2 rounded-full bg-gradient-to-r from-sky-400 via-amber-300 to-fuchsia-400" /><div className="mt-2 flex justify-between gap-4 text-xs font-bold text-slate-300"><span>0｜{room.theme.lowLabel}</span><span className="text-right">{room.theme.highLabel}｜120</span></div></div>}</section>}

          {room.phase === "clue" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">同じ数字カードへ新しいことばを出す</h2><p className="mt-1 text-sm text-slate-400">{room.round}回目の提出 {submittedCount}/{room.cards.length}枚</p></div>{room.phaseStartedAt && <GamePhaseTimer key={room.phaseStartedAt} durationSeconds={room.clueTimeLimitSeconds} startedAt={room.phaseStartedAt} label="提出時間" />}</div><p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm font-bold text-amber-100">今回のお題「{room.theme?.title}」に沿った短いことばだけで伝えてください。カードの数字は前回から変わりません。</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{ownCards.map((card) => <div key={card.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><div className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-4 text-center"><p className="text-xs font-bold text-amber-100">あなたのカード {card.cardNumber}</p><p className="mt-1 text-6xl font-black text-amber-300">{room.values[card.id]}</p></div>{room.clueHistory.length > 0 && <div className="mt-3 space-y-1">{room.clueHistory.map((clueRound) => <p key={clueRound.round} className="text-xs text-slate-300"><span className="font-bold text-cyan-200">{clueRound.round}回目：</span>{clueRound.clues[card.id]}</p>)}</div>}{room.clues[card.id] ? <div className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3"><p className="font-black text-emerald-100">提出済み：{room.clues[card.id]}</p></div> : <div className="mt-3"><label className="block text-sm font-bold">今回、このカードを表すことば<input value={clueDrafts[card.id] ?? ""} maxLength={40} onChange={(event) => setClueDrafts((current) => ({ ...current, [card.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") submitClue(card.id); }} className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-lg text-white outline-none focus:border-amber-300" /></label><button type="button" disabled={isSaving} onClick={() => submitClue(card.id)} className="mt-3 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">今回のことばを提出</button></div>}</div>)}</div><p className="mt-4 text-center text-sm text-slate-300">全カードがそろうと次のお題へ進み、最後の回だけ並べ替えへ進みます。</p>{isHost && room.debugMode && <button type="button" onClick={() => void runAction({ type: "debug-fill-clues", actorId: playerId, round: room.round })} className="mt-4 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">デバッグ：今回の未提出ことばを自動入力</button>}</section>}

          {room.phase === "arrange" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">全カードを小さい順に並べる</h2><p className="mt-1 text-sm text-slate-400">各カードに集まったすべてのことばを手がかりに、ホストが順番を操作します。</p></div>{room.phaseStartedAt && <GamePhaseTimer key={room.phaseStartedAt} durationSeconds={room.arrangeTimeLimitSeconds} startedAt={room.phaseStartedAt} label="相談時間" />}</div>{isHost && room.debugMode && <button type="button" onClick={() => void runAction({ type: "debug-sort", actorId: playerId, round: room.round })} className="mt-4 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">デバッグ：正解順に並べる</button>}<ol className="mt-4 space-y-2">{orderedCards.map(({ card, player }, index) => <li key={card.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3"><span className="w-7 text-center font-black text-cyan-300">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2">{room.clueHistory.map((clueRound) => <span key={clueRound.round} className="rounded-lg bg-cyan-300/10 px-2 py-1 text-sm font-bold text-cyan-50">{clueRound.clues[card.id]}</span>)}</div><p className="mt-1 text-xs text-slate-400">{player.name}・カード{card.cardNumber}{room.debugMode && isHost && typeof room.values[card.id] === "number" ? `・${room.values[card.id]}` : ""}</p></div>{isHost && <div className="flex gap-1"><button type="button" disabled={index === 0 || isSaving} onClick={() => moveClue(index, -1)} aria-label={`${player.name}のカード${card.cardNumber}を上へ`} className="rounded-lg border border-white/15 px-3 py-2 disabled:opacity-30">↑</button><button type="button" disabled={index === orderedCards.length - 1 || isSaving} onClick={() => moveClue(index, 1)} aria-label={`${player.name}のカード${card.cardNumber}を下へ`} className="rounded-lg border border-white/15 px-3 py-2 disabled:opacity-30">↓</button></div>}</li>)}</ol>{isHost ? <button type="button" disabled={isSaving} onClick={() => void runAction({ type: "score-round", actorId: playerId, round: room.round })} className="mt-5 w-full rounded-xl bg-fuchsia-400 px-4 py-3 font-black text-fuchsia-950 disabled:opacity-50">この順番で数字を公開する</button> : <p className="mt-4 rounded-xl bg-white/[0.05] p-3 text-center text-sm font-bold text-slate-300">ホストが順番を確定するまでお待ちください。</p>}</section>}

          {room.phase === "result" && latestResult && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">最後の答え合わせ</h2><div className="mt-4 space-y-2">{latestResult.order.map((id, index) => { const card = latestResult.cards.find((item) => item.id === id); const player = room.players.find((item) => item.id === card?.ownerId); return <div key={id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3"><span className="text-center font-black text-cyan-300">{index + 1}</span><div><div className="flex flex-wrap gap-2">{latestResult.clueRounds.map((clueRound) => <span key={clueRound.round} className="rounded-lg bg-cyan-300/10 px-2 py-1 text-sm font-bold text-cyan-50">{clueRound.clues[id]}</span>)}</div><p className="mt-1 text-xs text-slate-400">{player?.name}・カード{card?.cardNumber}</p></div><span className="text-2xl font-black text-amber-300">{latestResult.values[id]}</span></div>; })}</div><div className="mt-5 rounded-2xl bg-gradient-to-r from-cyan-400 to-amber-300 p-5 text-center text-slate-950"><p className="font-black">最終得点 {latestResult.points}/3点</p><p className="mt-1 text-sm font-bold">並び違い {latestResult.inversions}組</p></div><p className="mt-5 text-center text-lg font-black">{hodoaiFinalMessage(room.totalPoints, 3)}</p>{isHost ? <RoomResultActions disabled={isSaving} onPlayAgain={() => void runAction({ type: "reset-game", actorId: playerId })} onDissolve={() => void dissolveRoom()} /> : <p className="mt-4 text-center text-sm font-bold text-slate-300">ホストの操作を待っています。</p>}</section>}
          {room.phase === "result" && <GameResultShareButton title="ワードスケール プレイログ" text={hodoaiGameShareText(room)} url="/word-scale" />}
        </div>
      </div>
    </main>
  );
}
