"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DebugModeButton } from "@/app/components/DebugModeButton";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GamePhaseTimer } from "@/app/components/GamePhaseTimer";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import { RoomTimeLimitControl } from "@/app/components/RoomTimeLimitControl";
import { loadPlayerRoomDefaults, savePlayerRoomDefaults } from "@/lib/game-room-defaults-client";
import {
  kotobaSenpukuKana,
  kotobaSenpukuKanaKey,
  isValidKotobaSenpukuWord,
  normalizeKotobaSenpukuConfig,
  normalizeKotobaSenpukuWord,
  type KotobaSenpukuConfig,
  type KotobaSenpukuPlayer,
  type KotobaSenpukuRoom,
  type KotobaSenpukuRoomAction,
  type KotobaSenpukuRoomChoice,
} from "@/lib/kotoba-senpuku";
import {
  defaultAvatarImage,
  fallbackAvatarColor,
  isPlayerAuthenticated,
  loadPersistentPlayerSession,
  type PlayerSession,
} from "@/lib/player-session";

const lastRoomKey = "kotoba-senpuku-last-room";
const ownerIdKey = "kotoba-senpuku-owner-id";
const defaultsStorageKey = "kotoba-senpuku-room-defaults-v1";

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
  const config = normalizeKotobaSenpukuConfig(value);
  return {
    roundsTotal: config.roundsTotal,
    secretTimeLimitSeconds: config.secretTimeLimitSeconds,
    turnTimeLimitSeconds: config.turnTimeLimitSeconds,
    continuousScan: config.continuousScan,
    allowWordGuess: config.allowWordGuess,
  };
}

function formatTime(seconds: number) {
  return seconds === 0 ? "なし" : `${seconds}秒`;
}

function apiMessage(status: number, fallback: string) {
  if (status === 401) return "合言葉が違います。";
  if (status === 403) return "今はこの操作を行えません。手番や権限を確認してください。";
  if (status === 404) return "部屋が見つかりません。";
  if (status === 409) return "部屋が満員か、状態が更新されています。もう一度お試しください。";
  if (status === 503) return "部屋サーバーを利用できません。少し待ってお試しください。";
  return fallback;
}

async function loadRoom(code: string, playerId: string) {
  const params = new URLSearchParams({ code, playerId });
  const response = await fetch(`/api/kotoba-senpuku/rooms?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { room?: KotobaSenpukuRoom };
  return data.room ?? null;
}

async function loadActiveRoom(playerId: string) {
  const response = await fetch(`/api/kotoba-senpuku/rooms?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { room?: KotobaSenpukuRoom | null };
  return data.room ?? null;
}

function PlayerRow({ player, isHost, isMe, eliminated = false }: { player: KotobaSenpukuPlayer; isHost: boolean; isMe: boolean; eliminated?: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl border p-3 ${isMe ? "border-fuchsia-300 bg-fuchsia-300/10" : "border-white/10 bg-white/[0.04]"}`}>
      <span
        className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-cover bg-center"
        style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate font-bold">{player.name}{isMe ? "（あなた）" : ""}</span>
      {player.isDummy && <span className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs font-black text-cyan-100">ダミー</span>}
      {eliminated && <span className="rounded-md border border-rose-300/30 bg-rose-300/10 px-2 py-1 text-xs font-black text-rose-100">脱落</span>}
      {isHost && <span className="rounded-md bg-amber-300 px-2 py-1 text-xs font-black text-slate-950">ホスト</span>}
    </li>
  );
}

function BinaryRuleControl({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-200">{label}</legend>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {[
          { label: "なし", value: false },
          { label: "あり", value: true },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
              value === option.value
                ? "border-fuchsia-300 bg-fuchsia-300 text-fuchsia-950 shadow-sm"
                : "border-white/15 bg-white/[0.05] text-slate-200 hover:bg-white/10"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
    </fieldset>
  );
}

export function KotobaSenpukuGame() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [room, setRoom] = useState<KotobaSenpukuRoom | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [choices, setChoices] = useState<KotobaSenpukuRoomChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [secretWord, setSecretWord] = useState("");
  const [challengeTarget, setChallengeTarget] = useState("");
  const [challengeGuess, setChallengeGuess] = useState("");
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
      const savedRoom = lastCode ? await loadRoom(lastCode, savedSession.id) : await loadActiveRoom(savedSession.id);
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
  const activePlayer = room?.players[room.activePlayerIndex];
  const canControlTurn = Boolean(room?.phase === "battle" && activePlayer && (activePlayer.id === playerId || (room.debugMode && isHost)));
  const challengeTargets = room?.players.filter((player) => player.id !== activePlayer?.id && !room.exposedIds.includes(player.id)) ?? [];
  const effectiveTarget = challengeTargets.some((player) => player.id === challengeTarget) ? challengeTarget : challengeTargets[0]?.id ?? "";
  const latestResult = room?.history.at(-1);
  const winnerIds = latestResult?.winnerIds ?? (latestResult?.winnerId ? [latestResult.winnerId] : []);
  const winnerNames = room?.players.filter((player) => winnerIds.includes(player.id)).map((player) => player.name).join("・") ?? "";
  const ownSecretKana = new Set([...(room?.secrets[playerId] ?? "")].map(kotobaSenpukuKanaKey));
  const configItems = room ? [
    { label: "参加人数", value: `${room.players.length}人` },
    { label: "勝利条件", value: "最後の1人" },
    { label: "秘密語時間", value: formatTime(room.secretTimeLimitSeconds) },
    { label: "手番時間", value: formatTime(room.turnTimeLimitSeconds) },
    { label: "連続探知", value: room.continuousScan ? "あり" : "なし" },
    { label: "秘密語回答", value: room.allowWordGuess ? "あり" : "なし" },
    { label: "デバッグ", value: room.debugMode ? "ON" : "OFF" },
  ] : [];

  const runAction = async (action: KotobaSenpukuRoomAction) => {
    if (!room) return null;
    setIsSaving(true);
    try {
      const response = await fetch("/api/kotoba-senpuku/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: room.code, action }),
      });
      const data = (await response.json()) as { room?: KotobaSenpukuRoom; error?: string };
      if (!response.ok || !data.room) {
        const invalidWord = data.error === "Invalid secret word" ? "秘密語はひらがなと長音符で入力してください。" : "";
        setError(invalidWord || apiMessage(response.status, data.error || "操作を保存できませんでした。"));
        return null;
      }
      setRoom(data.room);
      setError("");
      return data.room;
    } catch {
      setError("通信できませんでした。接続を確認してください。");
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const createRoom = async () => {
    if (!session?.id) return;
    setIsSaving(true);
    const ownerId = getOwnerId();
    try {
      await fetch(`/api/kotoba-senpuku/rooms?ownerId=${encodeURIComponent(ownerId)}&fallbackHostId=${encodeURIComponent(session.id)}`, { method: "DELETE" });
      const defaults = await loadPlayerRoomDefaults({ game: "kotoba-senpuku", playerId: session.id, localStorageKey: defaultsStorageKey, normalize: normalizeDefaults });
      const now = Date.now();
      const host: KotobaSenpukuPlayer = { id: session.id, name: session.name, joinedAt: now, avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined };
      const nextRoom: KotobaSenpukuRoom = {
        code: makeRoomCode(), revision: 0, hostId: session.id, ownerId, passphrase: passphrase.trim(), phase: "lobby", players: [host], gameNumber: 1,
        ...defaults, debugMode: false, round: 1, theme: null, secrets: {}, submittedIds: [], masks: {}, calledKana: [], exposedIds: [],
        roundSignals: { [session.id]: 0 }, totalScores: { [session.id]: 0 }, activePlayerIndex: 0, turnNumber: 1,
        history: [], log: ["参加者を待っています。"], phaseStartedAt: null, createdAt: now, updatedAt: now,
      };
      const response = await fetch("/api/kotoba-senpuku/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: nextRoom, actorId: session.id }) });
      if (!response.ok) {
        setError(apiMessage(response.status, "部屋を作成できませんでした。"));
        return;
      }
      const data = (await response.json()) as { room: KotobaSenpukuRoom };
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
    const response = await fetch("/api/kotoba-senpuku/rooms", { cache: "no-store" });
    if (!response.ok) {
      setError(apiMessage(response.status, "部屋一覧を取得できませんでした。"));
      return;
    }
    const data = (await response.json()) as { rooms?: KotobaSenpukuRoomChoice[] };
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
    const player: KotobaSenpukuPlayer = { id: session.id, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined };
    setIsSaving(true);
    try {
      const action = { type: "join-room", actorId: session.id, player, passphrase } satisfies KotobaSenpukuRoomAction;
      const response = await fetch("/api/kotoba-senpuku/rooms", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, action }) });
      if (!response.ok) {
        setError(apiMessage(response.status, "部屋へ参加できませんでした。"));
        return;
      }
      const data = (await response.json()) as { room: KotobaSenpukuRoom };
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
    const response = await fetch(`/api/kotoba-senpuku/rooms?code=${encodeURIComponent(room.code)}&actorId=${encodeURIComponent(session.id)}`, { method: "DELETE" });
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

  const updateConfig = async (updates: Partial<Omit<KotobaSenpukuConfig, "debugMode">>) => {
    if (!room || !session?.id || !isHost) return;
    const config = normalizeKotobaSenpukuConfig({ ...room, ...updates, debugMode: room.debugMode });
    const saved = await runAction({ type: "update-config", actorId: session.id, config: normalizeDefaults(config) });
    if (saved) void savePlayerRoomDefaults({ game: "kotoba-senpuku", playerId: session.id, localStorageKey: defaultsStorageKey, defaults: normalizeDefaults(saved) });
  };

  const submitSecret = () => {
    if (!room || !playerId) return;
    const word = normalizeKotobaSenpukuWord(secretWord);
    if (!isValidKotobaSenpukuWord(word)) {
      setError("秘密語はひらがなと長音符だけで入力してください。カタカナや漢字は使用できません。");
      return;
    }
    void runAction({ type: "submit-secret", actorId: playerId, round: room.round, word }).then((saved) => {
      if (saved) setSecretWord("");
    });
  };

  const challengeWord = () => {
    if (!room || !playerId || !effectiveTarget) return;
    if (!isValidKotobaSenpukuWord(challengeGuess)) {
      setError("回答はひらがなと長音符だけで入力してください。");
      return;
    }
    void runAction({ type: "challenge-word", actorId: playerId, round: room.round, targetId: effectiveTarget, guess: challengeGuess }).then((saved) => {
      if (saved) setChallengeGuess("");
    });
  };

  const rulesDialog = <GameRulesDialog open={rulesOpen} title="ことばソナーのルール" onClose={() => setRulesOpen(false)}>
    <p>2人以上で遊びます。各自がお題に沿った秘密語を「ひらがな」と長音符「ー」だけで入力し、最後まで脱落せずに残ることを目指します。文字数と参加人数に上限はありません。</p>
    <h3 className="mt-4 font-black text-white">開始前の設定</h3>
    <ul className="mt-2 list-disc space-y-2 pl-5">
      <li>連続探知「あり」では、文字探知が1人以上に命中すると、自分が生存している限り続けて行動できます。「なし」では命中しても手番終了です。</li>
      <li>秘密語回答「あり」では、文字探知の代わりに相手の秘密語を直接回答できます。「なし」では文字探知だけで遊びます。</li>
    </ul>
    <h3 className="mt-4 font-black text-white">手番の行動</h3>
    <ol className="mt-2 list-decimal space-y-2 pl-5"><li>全員共通の文字盤から、まだ選ばれていない文字を1つ探知します。生存者の秘密語に含まれていれば、該当する文字をすべて公開します。誰にも命中しなければ手番終了です。</li><li>秘密語回答「あり」なら、生存者1人を指名して秘密語を回答できます。正解なら相手は即脱落し、不正解なら何も起こりません。正誤にかかわらず回答した時点で手番終了です。</li></ol>
    <p className="mt-4">濁点・半濁点、小さいかなは元の清音と同じ文字群として判定します。長音符「ー」は独立した探知文字です。</p>
    <p className="mt-2">公開された文字は、当てた順ではなく秘密語内の順番に並べ、隙間なく左詰めで表示します。同じ文字が複数あればすべて公開します。未公開文字・空き枠・残り文字数・総文字数は表示しません。</p>
    <h3 className="mt-4 font-black text-white">脱落と勝利</h3>
    <p className="mt-2">探知によって全文字が公開された人、または秘密語を直接当てられた人は脱落し、秘密語全体を公開します。脱落後は自分の手番がなくなります。最後まで残った1人が勝利です。</p>
    <p className="mt-2">最後の複数人が同じ文字探知で同時に脱落した場合は、その中で秘密語が最も短い人が勝利します。最短文字数も同じなら同率勝利です。</p>
  </GameRulesDialog>;

  if (!ready) return <main className="min-h-screen bg-slate-950 p-8 text-white">ログイン情報と部屋を確認中...</main>;

  if (!session?.id) {
    return <main className="min-h-screen bg-slate-950 px-4 py-12 text-white"><div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center"><h1 className="text-3xl font-black">ことばソナー</h1><p className="mt-4 leading-7 text-slate-300">このゲームはログインしたプレイヤー同士で遊びます。ゲームロビーでログインしてください。</p><Link href="/games" className="mt-6 inline-flex rounded-xl bg-fuchsia-400 px-5 py-3 font-black text-fuchsia-950">ゲームロビーへ</Link></div></main>;
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#701a75_0%,#172033_42%,#020617_82%)] px-4 py-8 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between gap-2"><Link href="/games" className="text-sm font-bold text-fuchsia-200">← ゲームロビー</Link><div className="flex items-center gap-2"><button type="button" onClick={() => setRulesOpen(true)} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold">ルール</button><span className="text-sm font-bold">{session.name}</span></div></div>
          <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl">
            <div className="bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-amber-300 px-6 py-8 text-slate-950"><p className="text-xs font-black uppercase tracking-[0.28em]">Original online word game</p><h1 className="mt-2 text-4xl font-black sm:text-6xl">ことばソナー</h1><p className="mt-3 font-bold">秘密のことばを探り合い、全文公開による脱落を避けて最後の1人を目指す。</p></div>
            <div className="grid gap-6 p-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋を作る</h2><p className="mt-2 text-sm leading-6 text-slate-400">あなたがホストになり、設定と進行を管理します。</p><label className="mt-4 block text-sm font-bold">合言葉（任意）<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><button type="button" disabled={isSaving} onClick={createRoom} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">新しい部屋を作る</button></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋に参加</h2><label className="mt-4 block text-sm font-bold">部屋コード<input value={joinCode} maxLength={4} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-lg uppercase text-white outline-none" /></label><label className="mt-3 block text-sm font-bold">合言葉<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={isSaving} onClick={() => void joinRoom()} className="rounded-xl bg-fuchsia-400 px-3 py-3 font-black text-fuchsia-950 disabled:opacity-50">コードで参加</button><button type="button" onClick={() => void listRooms()} className="rounded-xl border border-white/20 px-3 py-3 font-black">部屋一覧</button></div></div>
            </div>
            {showChoices && <div className="border-t border-white/10 p-6"><h2 className="font-black">参加できる部屋</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{choices.map((choice) => <button key={choice.code} type="button" onClick={() => { setJoinCode(choice.code); void joinRoom(choice.code); }} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 text-left"><span className="font-mono text-lg font-black text-fuchsia-300">{choice.code}</span><span className="ml-3 font-bold">{choice.hostName}</span><span className="mt-1 block text-xs text-slate-400">{choice.playerCount}人・合言葉{choice.hasPassphrase ? "あり" : "なし"}</span></button>)}</div></div>}
            {error && <p className="mx-6 mb-6 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          </section>
        </div>
        {rulesDialog}
      </main>
    );
  }

  return (
    <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#701a75_0%,#172033_35%,#020617_75%)] text-white ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow="Hidden word survival" title={<>ことばソナー <span className="font-mono text-base text-amber-300">#{room.code}</span></>}><Link href="/games" className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 font-semibold text-cyan-50 transition hover:bg-white/15">ゲームロビー</Link>{isHost && <DebugModeButton enabled={room.debugMode} disabled={isSaving || room.phase !== "lobby"} onAbort={room.debugMode && room.phase !== "lobby" ? () => runAction({ type: "abort-game", actorId: playerId }).then(() => undefined) : undefined} onChange={(enabled) => runAction({ type: "set-debug", actorId: playerId, enabled }).then(() => undefined)} />}<button type="button" onClick={() => setRulesOpen(true)} className="rounded-lg border border-amber-200 bg-amber-200 px-3 py-1.5 font-semibold text-slate-950">ルール</button><span className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 font-semibold">{session.name}</span>{isHost ? <button type="button" onClick={() => void dissolveRoom()} className="rounded-lg border border-rose-300/30 px-3 py-1.5 font-semibold text-rose-100">部屋を解散</button> : room.phase === "lobby" && <button type="button" onClick={() => void leaveRoom()} className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold">退出</button>}</GameTopBanner>
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 xl:grid-cols-[270px_minmax(0,1fr)_280px]">
        <aside className="space-y-4"><section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between"><h2 className="font-black">参加者</h2><span className="text-sm text-slate-400">{room.players.length}人</span></div><ul className="mt-3 space-y-2">{room.players.map((player) => <PlayerRow key={player.id} player={player} isHost={player.id === room.hostId} isMe={player.id === playerId} eliminated={room.exposedIds.includes(player.id)} />)}</ul></section><RoomConfigSummary items={configItems} /></aside>
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          {room.phase === "lobby" && isHost && (
            <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-5">
              <h2 className="font-black">ルール設定</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <BinaryRuleControl
                  label="連続探知"
                  description="あり：命中したら続けて行動。なし：探知1回で手番終了。"
                  value={room.continuousScan}
                  onChange={(value) => void updateConfig({ continuousScan: value })}
                />
                <BinaryRuleControl
                  label="秘密語回答"
                  description="あり：相手の秘密語を直接回答する行動を使えます。"
                  value={room.allowWordGuess}
                  onChange={(value) => void updateConfig({ allowWordGuess: value })}
                />
              </div>
            </section>
          )}
          {room.phase === "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">ゲーム開始前</h2>{isHost ? <div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="sm:row-span-2 rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/10 p-4 text-sm leading-6 text-fuchsia-50">秘密語が全部公開されると脱落し、以後の手番はありません。最後まで秘密語が残った1人が勝利です。</div><RoomTimeLimitControl label="秘密語の入力時間" value={room.secretTimeLimitSeconds} onChange={(seconds) => void updateConfig({ secretTimeLimitSeconds: seconds })} /><RoomTimeLimitControl label="1手番の時間" value={room.turnTimeLimitSeconds} onChange={(seconds) => void updateConfig({ turnTimeLimitSeconds: seconds })} /></div> : <p className="mt-4 rounded-xl bg-white/[0.05] p-4 text-slate-300">ホストが設定してゲームを開始するまでお待ちください。</p>}{isHost && room.debugMode && <div className="mt-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-4"><p className="text-sm font-bold text-cyan-50">ダミーを追加すると、ホスト1人で複数人の流れを確認できます。</p><button type="button" disabled={isSaving} onClick={() => void runAction({ type: "debug-add-player", actorId: playerId })} className="mt-3 w-full rounded-lg bg-cyan-200 px-4 py-2 font-black text-cyan-950 disabled:opacity-40">ダミーユーザーを追加</button></div>}{isHost && <button type="button" disabled={isSaving || room.players.length < 2} onClick={() => void runAction({ type: "start-game", actorId: playerId })} className="mt-6 w-full rounded-xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950 disabled:opacity-40">{room.players.length < 2 ? "2人以上で開始できます" : "このメンバーで開始"}</button>}</section>}

          {room.phase !== "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Survival match</p><h2 className="mt-2 text-2xl font-black sm:text-4xl">{room.theme?.title}</h2><p className="mt-2 text-sm text-slate-400">{room.theme?.guide}</p></div><span className="rounded-xl bg-fuchsia-400 px-4 py-2 font-black text-fuchsia-950">生存 {room.players.length - room.exposedIds.length}人</span></div></section>}

          {room.phase === "secret" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">秘密語を入力</h2><p className="mt-1 text-sm text-slate-400">提出 {room.submittedIds.length}/{room.players.length}人</p></div>{room.phaseStartedAt && <GamePhaseTimer key={room.phaseStartedAt} durationSeconds={room.secretTimeLimitSeconds} startedAt={room.phaseStartedAt} label="入力時間" />}</div>{room.secrets[playerId] ? <div className="mt-5 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4"><p className="font-black text-emerald-100">あなたの秘密語：{room.secrets[playerId]}</p><p className="mt-1 text-sm text-slate-300">全員の入力を待っています。他の秘密語は見えません。</p></div> : <div className="mt-5"><label className="block text-sm font-bold">ひらがな（文字数制限なし）<input value={secretWord} onChange={(event) => setSecretWord(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitSecret(); }} className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-lg text-white outline-none focus:border-fuchsia-300" /></label><button type="button" disabled={isSaving} onClick={submitSecret} className="mt-3 w-full rounded-xl bg-fuchsia-400 px-4 py-3 font-black text-fuchsia-950 disabled:opacity-50">秘密語を確定</button></div>}{isHost && room.debugMode && <button type="button" disabled={isSaving} onClick={() => void runAction({ type: "debug-fill-secrets", actorId: playerId, round: room.round })} className="mt-4 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">デバッグ：未入力を自動で埋める</button>}</section>}

          {room.phase === "battle" && <><section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-fuchsia-300">第{room.turnNumber}手</p><h2 className="text-2xl font-black">{activePlayer?.name}の手番</h2></div>{room.phaseStartedAt && <GamePhaseTimer key={room.phaseStartedAt} durationSeconds={room.turnTimeLimitSeconds} startedAt={room.phaseStartedAt} label="手番時間" />}</div><p className="mt-3 rounded-xl bg-white/[0.05] p-3 text-sm text-slate-300">秘密語が全部公開された人は脱落します。脱落者の手番は自動的に飛ばされます。</p>{room.debugMode && isHost && activePlayer?.id !== playerId && <p className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm font-bold text-cyan-50">デバッグ中：ホストが{activePlayer?.name}の手番を操作できます。</p>}</section>
            <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-xl font-black">文字スキャン</h2><p className="mt-1 text-sm text-slate-400">濁点・半濁点、小さい文字は元の文字と同じグループ。「ー」は独立して反応します。</p><p className="mt-2 text-xs font-bold text-amber-300">アンバー色は自分の秘密語に含まれる文字です。</p><div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">{kotobaSenpukuKana.map((kana) => { const called = room.calledKana.includes(kana); const isOwnKana = ownSecretKana.has(kana); return <button key={kana} type="button" disabled={!canControlTurn || called || isSaving} onClick={() => void runAction({ type: "scan-kana", actorId: playerId, round: room.round, kana })} className={`aspect-square rounded-lg border text-lg font-black transition disabled:cursor-not-allowed ${called ? "border-white/5 bg-slate-800 text-slate-500 opacity-40" : isOwnKana ? "border-amber-300/60 bg-amber-300/20 text-amber-200 hover:bg-amber-300/30" : "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100 hover:bg-fuchsia-300/20"}`}>{kana}</button>; })}</div></section>
            {room.allowWordGuess && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-xl font-black">秘密語を特定</h2><p className="mt-1 text-sm text-slate-400">正解なら相手は即脱落。不正解でも、回答した時点で手番は終了します。</p><div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]"><select value={effectiveTarget} disabled={!canControlTurn} onChange={(event) => setChallengeTarget(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-950">{challengeTargets.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select><input value={challengeGuess} disabled={!canControlTurn} onChange={(event) => setChallengeGuess(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") challengeWord(); }} placeholder="ひらがなで推理" className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white outline-none" /><button type="button" disabled={!canControlTurn || !effectiveTarget || !challengeGuess.trim() || isSaving} onClick={challengeWord} className="rounded-xl bg-amber-300 px-5 py-3 font-black text-slate-950 disabled:opacity-40">回答する</button></div>{isHost && room.debugMode && <button type="button" disabled={isSaving} onClick={() => void runAction({ type: "debug-auto-turn", actorId: playerId, round: room.round })} className="mt-4 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">デバッグ：この手番を自動実行</button>}</section>}
          </>}

          {room.phase === "result" && latestResult && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">{winnerNames || "勝者なし"}の勝利</h2>{winnerIds.length > 1 && <p className="mt-2 text-sm text-amber-200">同時脱落かつ最短文字数が同じため、同率勝利です。</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2">{room.players.map((player) => <div key={player.id} className={`rounded-xl border p-4 ${winnerIds.includes(player.id) ? "border-amber-300/40 bg-amber-300/10" : "border-white/10 bg-white/[0.05]"}`}><div className="flex items-center justify-between gap-3"><p className="font-black">{player.name}</p><span className="text-sm font-black text-amber-300">{winnerIds.includes(player.id) ? "勝利" : "脱落"}</span></div><p className="mt-2 font-mono text-2xl font-black tracking-widest text-fuchsia-200">{latestResult.secrets[player.id]}</p></div>)}</div>{isHost ? <button type="button" disabled={isSaving} onClick={() => void runAction({ type: "reset-game", actorId: playerId })} className="mt-5 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">同じ部屋でもう一度</button> : <p className="mt-4 text-center text-sm font-bold text-slate-300">ホストの操作を待っています。</p>}</section>}
        </div>
        <aside className="space-y-3">{room.phase !== "lobby" && <>{room.phase === "battle" && <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><p className="font-black">公開された文字</p><div className="mt-3 space-y-2">{room.players.map((player) => <div key={player.id} className={`min-h-24 rounded-lg border p-3 ${room.exposedIds.includes(player.id) ? "border-rose-300/30 bg-rose-300/10" : "border-cyan-300/20 bg-cyan-300/5"}`}><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold text-slate-300">{player.name}</p><span className="text-[10px] font-black">{room.exposedIds.includes(player.id) ? "脱落" : "生存"}</span></div><p className="mt-2 min-h-7 font-mono text-xl font-black tracking-widest">{room.masks[player.id]}</p>{room.secrets[player.id] && <p className="mt-1 text-xs text-amber-200">秘密語：{room.secrets[player.id]}</p>}</div>)}</div></section>}<section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><p className="font-black">行動履歴</p><ul className="mt-3 space-y-2">{room.log.slice(0, 12).map((entry, index) => <li key={`${entry}-${index}`} className="border-b border-white/5 pb-2 text-xs leading-5 text-slate-300">{entry}</li>)}</ul></section></>}</aside>
      </div>
      {rulesDialog}
    </main>
  );
}
