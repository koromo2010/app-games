"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { GameSdkRoomSnapshot, GameSdkTrustedActor, GameSdkViewer } from "@game-fields/game-sdk";
import { createGameSdkMockRuntime, type GameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import type { WordWolfSdkCommand, WordWolfSdkCreateInput, WordWolfSdkRoom } from "@/games/wordwolf-sdk/domain";
import { wordWolfSdkManifest } from "@/games/wordwolf-sdk/manifest";
import { wordWolfSdkServerModule, type WordWolfSdkRoomView } from "@/games/wordwolf-sdk/server-module";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";

type Runtime = GameSdkMockRuntime<WordWolfSdkRoom, WordWolfSdkCreateInput, WordWolfSdkCommand, WordWolfSdkRoomView>;
type Snapshot = GameSdkRoomSnapshot<WordWolfSdkRoomView>;
const players = [
  { playerId: "host", displayName: "あなた", role: "host" as const, debugAccess: true },
  { playerId: "michel", displayName: "Michel", role: "player" as const, debugAccess: false },
  { playerId: "sora", displayName: "Sora", role: "player" as const, debugAccess: false },
] satisfies GameSdkTrustedActor[];

function viewerFor(id: string): GameSdkViewer {
  if (id === "spectator") return { playerId: null, role: "spectator", debugAccess: false };
  const actor = players.find((item) => item.playerId === id) ?? players[0];
  return { playerId: actor.playerId, role: actor.role, debugAccess: actor.debugAccess };
}

const phaseLabel: Record<string, string> = { lobby: "開始前", clue: "ヒント", vote: "投票", wolfGuess: "逆転回答", result: "結果" };

export function WordWolfSdkExample() {
  const runtimeRef = useRef<Runtime | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [viewerId, setViewerId] = useState("host");
  const [clue, setClue] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  const refresh = async (id = viewerId) => {
    const next = await runtimeRef.current?.readRoom("WOLF", viewerFor(id));
    if (next) setSnapshot(next);
  };
  const send = async (command: WordWolfSdkCommand, actorId = viewerId) => {
    if (!snapshot || !runtimeRef.current) return;
    const actor = players.find((item) => item.playerId === actorId);
    if (!actor) return setError("観戦者は操作できません。");
    try {
      setError("");
      await runtimeRef.current.sendCommand({ code: snapshot.code, envelope: { expectedRevision: snapshot.revision, command }, actor });
      await refresh(viewerId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "操作に失敗しました。"); }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const runtime = createGameSdkMockRuntime({ module: wordWolfSdkServerModule });
      runtimeRef.current = runtime;
      let room = await runtime.createRoom({ roomCode: "WOLF", create: { topic: { villageWord: "犬", wolfWord: "猫" } }, actor: players[0] });
      for (const actor of players.slice(1)) room = (await runtime.sendCommand({ code: "WOLF", envelope: { expectedRevision: room.revision, command: { type: "room/join" } }, actor })).room;
      const hostView = await runtime.readRoom("WOLF", viewerFor("host"));
      if (active && hostView) setSnapshot(hostView);
    })();
    return () => { active = false; };
  }, []);

  const changeViewer = async (id: string) => { setViewerId(id); setError(""); await refresh(id); };
  if (!snapshot) return <main className="min-h-screen bg-slate-950 p-10 text-slate-100">公式サンプルを準備中…</main>;
  const view = snapshot.view;

  const currentPlayer = players.find((player) => player.playerId === viewerId) ?? players[0];
  return <main className={`min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_32%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-4 pb-8 text-slate-950 ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow={`GAME FIELDS OFFICIAL · SDK v${wordWolfSdkManifest.sdkVersion}`} title="ワードウルフ">
      <Link href="/sdk-examples" className={gameTopBannerActionClass}>広場へ</Link>
      <GameTopMenu>
        <Link href="/sdk-examples" data-menu-close="true" className={gameTopMenuItemClass}>SDK公式サンプル一覧</Link>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">この画面は共通UIとSDKゲーム固有部分の境界を確認する公式サンプルです。</p>
      </GameTopMenu>
      <GamePlayerMenu name={currentPlayer.displayName} avatarColor="#0891b2" />
    </GameTopBanner>
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[250px_minmax(0,1fr)_270px]">
      <RoomSidebar snapshot={snapshot} />
      <section className="rounded-lg border border-white/10 bg-white/[0.96] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.16)] md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-cyan-700">ワードウルフ固有画面</p><span className="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600">閲覧：{viewerId === "spectator" ? "観戦者" : currentPlayer.displayName}</span></div>
        {snapshot.phase === "lobby" && <div className="mt-12 text-center"><h2 className="text-3xl font-black">3人そろいました</h2><p className="mt-3 text-slate-300">人数・ホスト権限・設定・開始判定はSDK共通層が管理します。</p>{view.permissions.canStartGame && <button onClick={() => send({ type: "wordwolf/start" }, "host")} className="mt-7 rounded-xl bg-emerald-400 px-7 py-3 font-black text-slate-950">ゲーム開始</button>}</div>}
        {snapshot.phase === "clue" && <div className="mt-10"><p className="text-sm text-slate-500">あなたのお題</p><p className="mt-2 text-5xl font-black text-amber-600">{view.myWord ?? "観戦者には非公開"}</p><div className="mt-8 flex gap-2"><input value={clue} onChange={(event) => setClue(event.target.value)} placeholder="ヒントを入力" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3" /> <button disabled={!view.permissions.canSubmitClue} onClick={() => { void send({ type: "wordwolf/submit-clue", text: clue }); setClue(""); }} className="rounded-lg bg-cyan-600 px-5 font-bold text-white disabled:opacity-40">送信</button></div><Clues view={view} /></div>}
        {snapshot.phase === "vote" && <div className="mt-10"><h2 className="text-2xl font-black">狼だと思う人へ投票</h2><div className="mt-6 grid gap-3 sm:grid-cols-3">{view.players.map((player) => <button key={player.id} disabled={!view.permissions.canVote} onClick={() => send({ type: "wordwolf/vote", targetPlayerId: player.id })} className="rounded-lg border border-slate-300 bg-white p-4 font-bold disabled:opacity-40">{player.displayName}</button>)}</div><Clues view={view} /></div>}
        {snapshot.phase === "wolfGuess" && <div className="mt-10"><h2 className="text-2xl font-black">狼の逆転チャンス</h2>{view.permissions.canGuess ? <div className="mt-6 flex gap-2"><input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="市民のお題" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3"/><button onClick={() => send({ type: "wordwolf/guess", answer })} className="rounded-lg bg-amber-300 px-5 font-bold text-slate-950">回答</button></div> : <p className="mt-4 text-slate-600">狼の回答を待っています。</p>}</div>}
        {snapshot.phase === "result" && <div className="mt-14 text-center"><p className="text-sm text-slate-400">勝者</p><h2 className="mt-2 text-4xl font-black text-amber-200">{view.winner === "wolf" ? "狼チーム" : "市民チーム"}</h2>{viewerId === "host" && <button onClick={() => send({ type: "room/rematch" }, "host")} className="mt-7 rounded-xl bg-emerald-400 px-7 py-3 font-black text-slate-950">同じ部屋で再戦</button>}</div>}
        {error && <p className="mt-6 rounded-lg bg-rose-950 p-3 text-sm text-rose-200">{error}</p>}
      </section>
      <aside className="rounded-lg border border-white/10 bg-white/[0.96] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
        <p className="text-xs font-bold text-cyan-700">SDK DEBUG</p><label className="mt-5 block text-sm text-slate-700">閲覧視点<select value={viewerId} onChange={(event) => void changeViewer(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3">{players.map((player) => <option key={player.playerId} value={player.playerId}>{player.displayName}</option>)}<option value="spectator">観戦者</option></select></label>
        <div className="mt-7 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600"><b className="text-slate-950">検証する境界</b><ul className="mt-2 list-disc pl-5"><li>共通Roomとrevision</li><li>ホスト・参加者・観戦者</li><li>秘密語の閲覧制限</li><li>ゲーム固有Command</li><li>同じ参加者で再戦</li></ul></div>
        {snapshot.phase !== "lobby" && <button onClick={() => send({ type: "room/abort" }, "host")} className="mt-6 w-full rounded-xl border border-rose-400/50 px-4 py-3 text-sm font-bold text-rose-200">進行中断して開始前へ</button>}
      </aside>
    </div>
  </main>;
}

function RoomSidebar({ snapshot }: { snapshot: Snapshot }) {
  return <aside className="space-y-4 rounded-lg border border-white/10 bg-white/[0.96] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)]"><p className="text-xs font-bold text-cyan-700">SDK共通ルーム</p><RoomConfigSummary items={[{ label: "部屋コード", value: snapshot.code }, { label: "フェーズ", value: phaseLabel[snapshot.phase] ?? snapshot.phase }, { label: "revision", value: String(snapshot.revision) }]} /><div><h2 className="font-bold">参加者</h2><ul className="mt-2 space-y-2">{snapshot.view.players.map((player) => <li key={player.id} className="flex justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm"><span>{player.displayName}</span>{player.id === "host" && <b className="text-cyan-700">HOST</b>}</li>)}</ul></div></aside>;
}

function Clues({ view }: { view: WordWolfSdkRoomView }) {
  if (!view.clues.length) return null;
  return <div className="mt-8"><h3 className="font-bold">ヒント</h3><ul className="mt-2 space-y-2">{view.clues.map((item) => <li key={`${item.round}-${item.playerId}`} className="rounded-lg bg-slate-100 px-4 py-2 text-sm"><b>{view.players.find((p) => p.id === item.playerId)?.displayName}</b>：{item.text}</li>)}</ul></div>;
}
