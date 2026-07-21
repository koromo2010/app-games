"use client";

import Link from "next/link";
import { DebugModeButton } from "@/app/components/DebugModeButton";
import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GameLoungeVisual } from "@/app/components/GameLoungeVisual";
import { PlayerTimeoutNotice } from "@/app/components/PlayerTimeoutNotice";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { OnlineRoomSpectatorLink } from "@/app/components/OnlineRoomSpectatorLink";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import { RoomResultActions } from "@/app/components/RoomResultActions";
import { RoomLobbyReturnStatus } from "@/app/components/RoomLobbyReturnStatus";
import { hodoaiRoomApi } from "./hodoai-room-api-client";
import { HodoaiPlayPanels } from "./HodoaiPlayPanels";
import { HodoaiRulesDialog } from "./HodoaiRulesDialog";
import { WordScaleRoomPanel } from "./WordScaleRoomPanel";
import type { HodoaiController } from "./use-hodoai-controller";
import { defaultAvatarImage, fallbackAvatarColor } from "@/lib/player-session";
import { hodoaiGameShareText, hodoaiFinalMessage, type HodoaiPlayer } from "@/lib/hodoai-talk";

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

export function HodoaiDesktopLayout({ controller }: { controller: HodoaiController }) {
  const { state, session, playerId, viewModel, permissions, resultReturnGate, actions } = controller;
  const { room, error, passphrase, joinCode, choices, showChoices, isSaving, rulesOpen, ready, isRestoringRoom } = state;
  const { isHost, latestResult, latestResultRows, configItems } = viewModel;
  const { runAction, createRoom, listRooms, joinRoom, dissolveRoom, leaveRoom, updateConfig, setError, setPassphrase, setJoinCode, setRulesOpen } = actions;
  const rulesDialog = <HodoaiRulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />;

  if (!ready) return <main className="min-h-screen bg-slate-950 p-8 text-white">ログイン情報と部屋を確認中...</main>;

  if (!session?.id) {
    return <main className="min-h-screen bg-slate-950 px-4 py-12 text-white"><div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center"><h1 className="text-3xl font-black">ワードスケール</h1><p className="mt-4 leading-7 text-slate-300">このゲームはログインしたプレイヤー同士で遊びます。広場でログインしてください。</p><Link href="/games" className="mt-6 inline-flex rounded-xl bg-cyan-400 px-5 py-3 font-black text-cyan-950">広場へ</Link></div></main>;
  }

  if (!room) {
    return (
      <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#164e63_0%,#1e293b_42%,#020617_82%)] px-4 pb-8 text-white ${gameTopBannerOffsetClass}`}>
        <GameTopBanner eyebrow="Online cooperative game" title="ワードスケール">
          <Link href="/games" className={gameTopBannerActionClass}>広場へ戻る</Link>
          <GameTopMenu><button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button></GameTopMenu>
          <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
        </GameTopBanner>
        <div className="mx-auto max-w-4xl">
          <GameLoungeVisual gameId="hodoai" className="mt-5" />
          <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl">
            <div className="bg-gradient-to-r from-sky-400 via-amber-300 to-fuchsia-400 px-6 py-8 text-slate-950"><p className="text-xs font-black uppercase tracking-[0.28em]">Online room game</p><h1 className="mt-2 text-4xl font-black sm:text-6xl">ワードスケール</h1><p className="mt-3 font-bold">配られた数字カードを指定テーマのことばで表し、全カードを小さい順に並べる協力ゲーム。</p></div>
            {isRestoringRoom && <p className="border-b border-cyan-300/20 bg-cyan-300/10 px-6 py-3 text-sm font-bold text-cyan-100">前回の部屋を確認中です。画面は先に表示しています。</p>}
            <div inert={isRestoringRoom} aria-busy={isRestoringRoom} className={`grid gap-6 p-6 md:grid-cols-2 ${isRestoringRoom ? "opacity-60" : ""}`}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋を作る</h2><p className="mt-2 text-sm leading-6 text-slate-400">あなたがホストになり、設定と進行を管理します。</p><label className="mt-4 block text-sm font-bold">合言葉（任意）<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><button type="button" disabled={isSaving} onClick={createRoom} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">新しい部屋を作る</button></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋に参加</h2><label className="mt-4 block text-sm font-bold">部屋コード<input value={joinCode} maxLength={4} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-lg uppercase text-white outline-none" /></label><label className="mt-3 block text-sm font-bold">合言葉<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={isSaving} onClick={() => void joinRoom()} className="rounded-xl bg-cyan-400 px-3 py-3 font-black text-cyan-950 disabled:opacity-50">コードで参加</button><button type="button" onClick={() => void listRooms()} className="rounded-xl border border-white/20 px-3 py-3 font-black">部屋一覧</button></div></div>
            </div>
            {showChoices && <div className="border-t border-white/10 p-6"><h2 className="font-black">参加できる部屋</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{choices.map((choice) => <button key={choice.code} type="button" onClick={() => { setJoinCode(choice.code); void joinRoom(choice.code); }} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 text-left"><span className="font-mono text-lg font-black text-cyan-300">{choice.code}</span><span className="ml-3 font-bold">{choice.hostName}</span><span className="mt-1 block text-xs text-slate-400">{choice.playerCount}人・1人{choice.cardsPerPlayer}枚・ことば{choice.roundsTotal}回・合言葉{choice.hasPassphrase ? "あり" : "なし"}</span></button>)}</div></div>}
            {error && <p className="mx-6 mb-6 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          </section>
        </div>
        <GameAdSlot gameId="hodoai" surface="game-entry" />
        {rulesDialog}
      </main>
    );
  }

  return (
    <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#0e7490_0%,#172033_35%,#020617_75%)] text-white ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow="Online cooperative game" title={<>ワードスケール <span className="font-mono text-base text-amber-300">#{room.code}</span></>}>
        {room.phase === "lobby" && (permissions.canDissolve ? <button type="button" onClick={() => void dissolveRoom()} className={gameTopBannerDangerActionClass}>部屋を解散</button> : <Link href="/games" className={gameTopBannerActionClass}>広場へ戻る</Link>)}
        <GameTopMenu>
          {room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>広場へ戻る</Link>}
          <OnlineRoomSpectatorLink game="hodoai" code={room.code} />
          <button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button>
          {permissions.canDebug && <DebugModeButton enabled={room.debugMode} disabled={isSaving || room.phase !== "lobby"} onAbort={permissions.canAbort ? () => runAction({ type: "abort-game", actorId: playerId }).then(() => undefined) : undefined} replayEnabled={room.debugReplayEnabled} replayDisabled={isSaving} onReplayChange={(enabled) => runAction({ type: "set-debug-replay", actorId: playerId, enabled }).then(() => undefined)} debugLogEntries={room.debugLog} onChange={(enabled) => runAction({ type: "set-debug", actorId: playerId, enabled }).then(() => undefined)} />}
          {permissions.canLeave && <button type="button" data-menu-close="true" onClick={() => void leaveRoom()} className={gameTopMenuItemClass}>退出</button>}
        </GameTopMenu>
        <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
      </GameTopBanner>
      {rulesDialog}
      <div className="mx-auto max-w-5xl px-4 pt-4"><PlayerTimeoutNotice playerTimeouts={room.playerTimeouts} playerTimeoutNotice={room.playerTimeoutNotice} currentPlayerId={playerId} disabled={isSaving} onRecover={() => runAction({ type: "recover-player", actorId: playerId }).then(() => undefined)} /></div>
      <GameAdSlot gameId="hodoai" surface={room.phase === "lobby" ? "room-lobby" : room.phase === "result" ? "result" : null} disabled={room.debugMode} />
      {room.phase === "lobby" && <div className="mx-auto max-w-6xl px-4 pt-4"><GameLoungeVisual gameId="hodoai" /></div>}
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <WordScaleRoomPanel playerCount={room.players.length}>
          <section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between"><h2 className="font-black">参加者</h2><span className="text-sm text-slate-400">{room.players.length}人</span></div><ul className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-1">{room.players.map((player) => <PlayerRow key={player.id} player={player} isHost={player.id === room.hostId} isMe={player.id === playerId} />)}</ul><RoomLobbyReturnStatus state={room.lobbyReturn} players={room.players} hostId={room.hostId} isHost={isHost} onRemoveWaitingPlayer={(player) => { if (window.confirm(`${player.name}さんを退出扱いにしますか？`)) void runAction({ type: "remove-waiting-player", actorId: playerId, targetPlayerId: player.id }); }} /></section>
          <RoomConfigSummary items={configItems} />
        </WordScaleRoomPanel>
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          <HodoaiPlayPanels room={room} playerId={playerId} isHost={isHost} isSaving={isSaving} runAction={runAction} updateConfig={updateConfig} />
          {room.phase === "result" && latestResult && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">最後の答え合わせ</h2><p className="mt-1 text-sm font-bold text-slate-400">上が120側、下が0側です。</p><div className="mt-4 space-y-2">{latestResultRows.map((row) => <div key={row.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3"><span className="text-center font-black text-cyan-300">{row.rank}</span><div><div className="flex flex-wrap gap-2">{row.expressions.map((expression, index) => <span key={`${row.id}:${index}`} className="rounded-lg bg-cyan-300/10 px-2 py-1 text-sm font-bold text-cyan-50">{expression}</span>)}</div><p className="mt-1 text-xs text-slate-400">{row.playerName}・カード{row.cardNumber}</p></div><span className="text-2xl font-black text-amber-300">{row.value}</span></div>)}</div><div className="mt-5 rounded-2xl bg-gradient-to-r from-cyan-400 to-amber-300 p-5 text-center text-slate-950"><p className="font-black">最終得点 {latestResult.points}/3点</p><p className="mt-1 text-sm font-bold">並び違い {latestResult.inversions}組</p></div><p className="mt-5 text-center text-lg font-black">{hodoaiFinalMessage(room.totalPoints, 3)}</p><RoomResultActions canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={isSaving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : () => resultReturnGate.returnToRoom((code) => hodoaiRoomApi.fetchRoom(code, playerId), () => setError("部屋に戻れません。解散されたか、参加情報が変更されています。"))} onDissolve={isHost ? dissolveRoom : undefined} /></section>}
          {room.phase === "result" && <GameResultShareButton title="ワードスケール プレイログ" text={hodoaiGameShareText(room)} url="/word-scale" />}
        </div>
      </div>
    </main>
  );
}
