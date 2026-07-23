"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { DebugModeButton } from "@/app/components/DebugModeButton";
import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GameLoungeVisual } from "@/app/components/GameLoungeVisual";
import { GamePhaseTimer } from "@/app/components/GamePhaseTimer";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { OnlineRoomSpectatorLink } from "@/app/components/OnlineRoomSpectatorLink";
import { PageLoadingOverlay } from "@/app/components/PageLoadingOverlay";
import { PlayingCardHand } from "@/app/components/PlayingCardHand";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import { RoomLobbyReturnStatus } from "@/app/components/RoomLobbyReturnStatus";
import { RoomResultActions } from "@/app/components/RoomResultActions";
import { RoomTimeLimitControl } from "@/app/components/RoomTimeLimitControl";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { canPassDaifugoTurn } from "@/lib/daifugo";
import { daifugoMaximumPlayers, daifugoMinimumPlayers, type DaifugoRoomPlayer, type DaifugoRoomView } from "@/lib/daifugo-room";
import { allRoomPlayersReturned } from "@/lib/room-lobby-return";
import { defaultAvatarImage, fallbackAvatarColor } from "@/lib/player-session";
import { DaifugoRulesDialog } from "./DaifugoRulesDialog";
import { DaifugoTable } from "./DaifugoTable";
import { daifugoText, formatDaifugoText, type DaifugoCopy } from "./daifugo-i18n";
import type { DaifugoController } from "./use-daifugo-controller";

function timeLimitLabel(seconds: number, d: DaifugoCopy) { return seconds > 0 ? formatDaifugoText(d.seconds, { seconds }) : d.noLimit; }
function PlayerRow({ player, room, playerId, controlledPlayerId, canControl, onControl }: { player: DaifugoRoomPlayer; room: DaifugoRoomView; playerId: string; controlledPlayerId: string; canControl: boolean; onControl: () => void }) {
  const { locale } = useAppLocale();
  const d = daifugoText(locale);
  const rankNames = [d.rank1, d.rank2, d.rank3, d.rank4];
  const finishIndex = room.game?.finishOrder.indexOf(player.id) ?? -1;
  const selected = player.id === controlledPlayerId;
  return <li>
    <button type="button" disabled={!canControl} onClick={onControl} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${selected ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-white/[0.04]"} ${canControl ? "cursor-pointer hover:border-cyan-200" : "cursor-default"}`}>
      <span className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-cover bg-center" style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-bold">{player.name}{player.id === playerId ? d.you : ""}</span>
      {finishIndex >= 0 && <span className="rounded bg-amber-300 px-2 py-1 text-xs font-black text-slate-950">{rankNames[finishIndex] ?? `#${finishIndex + 1}`}</span>}
      {player.isDummy && <span className="rounded bg-cyan-200 px-2 py-1 text-xs font-black text-cyan-950">{d.dummy}</span>}
      {player.id === room.hostId && <span className="rounded bg-white/15 px-2 py-1 text-xs font-black">{d.host}</span>}
    </button>
  </li>;
}

export function DaifugoDesktopLayout({ controller }: { controller: DaifugoController }) {
  const { state, setters, viewModel, permissions, actions, result: resultReturnGate } = controller;
  const {
    session, room, ready, error, passphrase, joinCode, choices, showChoices,
    capacity, selectedCardIds, saving, rulesOpen,
  } = state;
  const {
    locale, d, rankNames, playerId, game, controlledPlayerId,
    controlledPlayerName, hand, isControlledTurn,
  } = viewModel;
  const { isHost } = permissions;
  const {
    setPassphrase, setJoinCode, setCapacity, setSelectedCardIds,
    setDebugControlledPlayerId, setRulesOpen,
  } = setters;
  const {
    runAction, createRoom, joinRoom, listRooms, leaveRoom, dissolveRoom,
    play, pass, returnToRoom,
  } = actions;

  if (!ready) return <PageLoadingOverlay label={d.checking} />;
  if (!session?.id) return <main className="min-h-screen bg-slate-950 px-4 py-12 text-white"><div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center"><h1 className="text-3xl font-black">{d.title}</h1><p className="mt-4 text-slate-300">{d.loginRequired}</p><Link href="/games" className="mt-6 inline-flex rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950">{d.lobbyShort}</Link><Link href="/daifugo/practice" className="ml-3 mt-6 inline-flex rounded-xl border border-white/20 px-5 py-3 font-black">{d.practice}</Link></div><GameAdSlot gameId="daifugo" surface="game-entry" /></main>;

  if (!room) return <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#164e63_0%,#0f172a_45%,#020617_100%)] text-white ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="ONLINE CARD GAME" title={d.title}><Link href="/games" className={gameTopBannerActionClass}>{d.lobby}</Link><GameTopMenu><Link href="/daifugo/practice" className={gameTopMenuItemClass}>{d.practice}</Link><button type="button" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>{d.rules}</button></GameTopMenu><GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} /></GameTopBanner>
    <div className="mx-auto max-w-4xl px-4 pt-6"><GameLoungeVisual gameId="daifugo" /></div><div className="mx-auto max-w-4xl px-4 py-6"><section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl"><div className="bg-gradient-to-r from-cyan-300 to-amber-200 p-7 text-slate-950"><p className="text-xs font-black tracking-[.25em]">DAIFUGO</p><h1 className="mt-2 text-5xl font-black">{d.title}</h1><p className="mt-2 font-bold">{d.tagline}</p></div><div className="grid gap-6 p-6 md:grid-cols-2"><div><h2 className="text-xl font-black">{d.createRoom}</h2><label className="mt-4 block text-sm font-bold">{d.capacity}<select value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} className="mt-1 w-full rounded-xl bg-slate-800 px-3 py-2">{Array.from({ length: 4 }, (_, index) => index + 3).map((count) => <option key={count}>{count}</option>)}</select></label><label className="mt-3 block text-sm font-bold">{d.passphraseOptional}<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2" /></label><button type="button" disabled={saving} onClick={() => void createRoom()} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40">{d.createNewRoom}</button></div><div><h2 className="text-xl font-black">{d.joinRoom}</h2><label className="mt-4 block text-sm font-bold">{d.roomCode}<input value={joinCode} maxLength={4} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-lg" /></label><label className="mt-3 block text-sm font-bold">{d.passphrase}<input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2" /></label><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => void joinRoom()} className="rounded-xl bg-cyan-300 px-3 py-3 font-black text-slate-950">{d.joinByCode}</button><button type="button" onClick={() => void listRooms()} className="rounded-xl border border-white/20 px-3 py-3 font-black">{d.roomList}</button></div></div></div>{showChoices && <div className="border-t border-white/10 p-6">{choices.length === 0 ? <p>{d.noRooms}</p> : choices.map((choice) => <button key={choice.code} type="button" onClick={() => void joinRoom(choice.code)} className="mr-2 mt-2 rounded-xl border border-white/15 p-3 text-left"><b className="font-mono text-cyan-200">{choice.code}</b> {choice.hostName}<small className="block text-slate-400">{choice.playerCount}/{choice.playerCapacity}{d.people} · {d.passphrase}: {choice.hasPassphrase ? d.yes : d.no}</small></button>)}</div>}{error && <p className="mx-6 mb-6 rounded-xl bg-rose-300/10 p-3 text-rose-100">{error}</p>}</section></div><GameAdSlot gameId="daifugo" surface="game-entry" /><DaifugoRulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
  </main>;

  return <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#164e63_0%,#0f172a_45%,#020617_100%)] text-white ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="ONLINE CARD GAME" title={<>{d.title} <span className="font-mono text-base text-amber-300">#{room.code}</span></>}>
      {room.phase === "lobby" && (isHost ? <button type="button" className={gameTopBannerDangerActionClass} onClick={() => void dissolveRoom()}>{d.dissolve}</button> : <button type="button" className={gameTopBannerActionClass} onClick={() => void leaveRoom()}>{d.leave}</button>)}
      <GameTopMenu><Link href="/games" className={gameTopMenuItemClass}>{d.lobby}</Link><OnlineRoomSpectatorLink game="daifugo" code={room.code} /><button type="button" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>{d.rules}</button></GameTopMenu>
      {isHost && <DebugModeButton variant="banner" enabled={room.debugMode} disabled={saving || room.phase !== "lobby"} onAbort={room.debugMode && room.phase !== "lobby" ? () => runAction({ type: "abort-game", actorId: playerId }).then(() => undefined) : undefined} replayEnabled={room.debugReplayEnabled} replayDisabled={saving} onReplayChange={(enabled) => runAction({ type: "set-debug-replay", actorId: playerId, enabled }).then(() => undefined)} debugLogEntries={room.debugLog} onChange={(enabled) => runAction({ type: "set-debug", actorId: playerId, enabled }).then(() => undefined)} />}
      <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
    </GameTopBanner><DaifugoRulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} /><GameAdSlot gameId="daifugo" surface={room.phase === "lobby" ? "room-lobby" : room.phase === "result" ? "result" : null} disabled={room.debugMode} />
    {room.phase === "lobby" && <div className="mx-auto max-w-6xl px-4 pt-4"><GameLoungeVisual gameId="daifugo" /></div>}
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[280px_minmax(0,1fr)]"><aside className="space-y-4"><section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><h2 className="font-black">{d.participants} {room.players.length}/{room.playerCapacity}</h2>{isHost && room.debugMode && game && <p className="mt-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-100">{locale === "en" ? "Select a dummy player to inspect and control its hand." : "ダミーを選ぶと、その手札を表示して代理操作できます。"}</p>}<ul className="mt-3 space-y-2">{room.players.map((player) => <PlayerRow key={player.id} player={player} room={room} playerId={playerId} controlledPlayerId={controlledPlayerId} canControl={Boolean(isHost && room.debugMode && game && (player.id === playerId || player.isDummy))} onControl={() => { setDebugControlledPlayerId(player.isDummy ? player.id : ""); setSelectedCardIds([]); }} />)}</ul><RoomLobbyReturnStatus state={room.lobbyReturn} players={room.players} hostId={room.hostId} isHost={isHost} onRemoveWaitingPlayer={(player) => { if (window.confirm(formatDaifugoText(d.confirmRemove, { name: player.name }))) void runAction({ type: "remove-waiting-player", actorId: playerId, targetPlayerId: player.id }); }} /></section><RoomConfigSummary title={d.currentConfig} items={[{ label: d.capacity, value: `${room.playerCapacity}${d.people}` }, { label: d.passphrase, value: room.hasPassphrase ? d.yes : d.no }, { label: d.turnTime, value: timeLimitLabel(room.turnTimeLimitSeconds, d) }]} /></aside><div className="space-y-4">{error && <p className="rounded-xl bg-rose-300/10 p-3 font-bold text-rose-100">{error}</p>}
      {room.phase === "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">{d.beforeStart}</h2><p className="mt-2 text-slate-300">{d.startHelp}</p>{isHost && <div className="mt-5 rounded-xl bg-white/[0.05] p-4"><label className="text-sm font-bold">{d.capacity}<select value={room.playerCapacity} onChange={(event) => void runAction({ type: "set-config", actorId: playerId, playerCapacity: Number(event.target.value), turnTimeLimitSeconds: room.turnTimeLimitSeconds })} className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2">{Array.from({ length: daifugoMaximumPlayers - daifugoMinimumPlayers + 1 }, (_, index) => index + daifugoMinimumPlayers).map((count) => <option key={count}>{count}</option>)}</select></label><div className="mt-4 rounded-xl bg-white p-4 text-slate-950"><RoomTimeLimitControl label={d.oneTurnLimit} value={room.turnTimeLimitSeconds} onChange={(seconds) => void runAction({ type: "set-config", actorId: playerId, playerCapacity: room.playerCapacity, turnTimeLimitSeconds: seconds })} /></div></div>}{isHost && room.debugMode && <button type="button" disabled={room.players.length >= room.playerCapacity} onClick={() => void runAction({ type: "debug-add-player", actorId: playerId })} className="mt-4 w-full rounded-xl bg-cyan-200 p-3 font-black text-cyan-950 disabled:opacity-40">{d.addDummy}</button>}{isHost ? <button type="button" disabled={saving || room.players.length < daifugoMinimumPlayers || !allRoomPlayersReturned(room.lobbyReturn, room.players)} onClick={() => void runAction({ type: "start-game", actorId: playerId })} className="mt-4 w-full rounded-xl bg-amber-300 p-4 text-lg font-black text-slate-950 disabled:opacity-40">{!allRoomPlayersReturned(room.lobbyReturn, room.players) ? d.waitingReturn : room.players.length < daifugoMinimumPlayers ? d.needThree : d.startMembers}</button> : <p className="mt-5 text-center font-bold">{d.waitHost}</p>}</section>}
      {game && <><div className="flex justify-end">{room.phaseStartedAt && room.phase === "playing" && <GamePhaseTimer key={room.phaseStartedAt} durationSeconds={room.turnTimeLimitSeconds} startedAt={room.phaseStartedAt} label={d.turn} />}</div><DaifugoTable state={game} viewerId={controlledPlayerId} handCounts={game.handCounts} /><section className={`rounded-2xl border bg-slate-950/85 p-5 ${isControlledTurn ? "border-cyan-300" : "border-white/10"}`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black">{controlledPlayerId === playerId ? d.yourHand : (locale === "en" ? `${controlledPlayerName}'s hand` : `${controlledPlayerName}の手札`)} <span className="text-sm text-slate-400">{hand.length}{d.cards}</span></h2>{controlledPlayerId !== playerId && <button type="button" onClick={() => { setDebugControlledPlayerId(""); setSelectedCardIds([]); }} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold">{locale === "en" ? "Back to my hand" : "自分の手札へ戻る"}</button>}</div>{controlledPlayerId !== playerId && <p className="mt-2 text-sm font-bold text-cyan-200">{locale === "en" ? `Debug control: ${controlledPlayerName}` : `デバッグ代理操作中：${controlledPlayerName}`}</p>}{hand.length ? <PlayingCardHand cards={hand} selectedCardIds={selectedCardIds} disabledCardIds={isControlledTurn ? undefined : hand.map((card) => card.id)} size="sm" label={d.yourHandLabel} onCardClick={(card) => setSelectedCardIds((ids) => ids.includes(card.id) ? ids.filter((id) => id !== card.id) : [...ids, card.id])} /> : <p className="my-5 text-center font-bold text-amber-200">{d.handEmpty}</p>}<div className="flex justify-center gap-3 border-t border-white/10 pt-4"><button type="button" disabled={!isControlledTurn || selectedCardIds.length === 0 || saving} onClick={play} className="rounded-xl bg-cyan-300 px-6 py-3 font-black text-slate-950 disabled:opacity-35">{d.playSelected}</button><button type="button" disabled={!game || !canPassDaifugoTurn(game, controlledPlayerId) || saving} onClick={pass} className="rounded-xl border border-white/20 px-6 py-3 font-black disabled:opacity-35">{d.pass}</button></div></section></>}
      {room.phase === "result" && game && <section className="rounded-2xl border border-amber-300/30 bg-amber-50 p-6 text-slate-950"><h2 className="text-3xl font-black">{d.finished}</h2><ol className="mt-4 grid gap-2 sm:grid-cols-2">{game.finishOrder.map((id, index) => <li key={id} className="rounded-xl bg-white p-3 shadow"><b>#{index + 1} · {rankNames[index] ?? ""}</b>　{room.players.find((player) => player.id === id)?.name}</li>)}</ol><RoomResultActions canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={saving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : returnToRoom} onDissolve={isHost ? dissolveRoom : undefined} /></section>}{room.phase === "result" && game && <GameResultShareButton title={d.resultTitle} text={formatDaifugoText(d.resultText, { players: room.players.length, place: game.finishOrder.indexOf(playerId) + 1, turns: game.turnNumber })} url="/daifugo" />}
    </div></div>
  </main>;
}
