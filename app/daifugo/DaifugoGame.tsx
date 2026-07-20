"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DebugModeButton } from "@/app/components/DebugModeButton";
import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GameLoungeVisual } from "@/app/components/GameLoungeVisual";
import { GamePhaseTimer } from "@/app/components/GamePhaseTimer";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { OnlineRoomSpectatorLink } from "@/app/components/OnlineRoomSpectatorLink";
import { PlayingCardHand } from "@/app/components/PlayingCardHand";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import { RoomLobbyReturnStatus } from "@/app/components/RoomLobbyReturnStatus";
import { RoomResultActions } from "@/app/components/RoomResultActions";
import { RoomTimeLimitControl } from "@/app/components/RoomTimeLimitControl";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "@/app/hooks/use-online-room-polling";
import { useRoomResultReturnGate } from "@/app/hooks/use-room-result-return-gate";
import { useRoomLobbyReturnConfirmation } from "@/app/hooks/use-room-lobby-return-confirmation";
import { applyDaifugoRoomAction, createDaifugoRoom, daifugoRoomApi } from "@/app/daifugo/daifugo-room-api-client";
import { canPassDaifugoTurn, daifugoPlayError, sortDaifugoHand } from "@/lib/daifugo";
import { daifugoMaximumPlayers, daifugoMinimumPlayers, type DaifugoRoomAction, type DaifugoRoomChoice, type DaifugoRoomPlayer, type DaifugoRoomView } from "@/lib/daifugo-room";
import { OnlineRoomApiError, restoreOnlineRoom } from "@/lib/online-room-api-client";
import { allRoomPlayersReturned } from "@/lib/room-lobby-return";
import { defaultAvatarImage, fallbackAvatarColor, isPlayerAuthenticated, loadPersistentPlayerSession, type PlayerSession } from "@/lib/player-session";
import { DaifugoRulesDialog } from "./DaifugoRulesDialog";
import { DaifugoTable } from "./DaifugoTable";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { daifugoText, formatDaifugoText, localizeDaifugoPlayError, type DaifugoCopy } from "./daifugo-i18n";

const lastRoomKey = "daifugo-last-room";
const ownerIdKey = "daifugo-owner-id";
function makeRoomCode() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }
function getOwnerId() { const saved = localStorage.getItem(ownerIdKey); if (saved) return saved; const value = crypto.randomUUID(); localStorage.setItem(ownerIdKey, value); return value; }
function timeLimitLabel(seconds: number, d: DaifugoCopy) { return seconds > 0 ? formatDaifugoText(d.seconds, { seconds }) : d.noLimit; }
function apiMessage(error: unknown, fallback: string, d: DaifugoCopy) {
  if (!(error instanceof OnlineRoomApiError)) return fallback;
  if (error.status === 401) return d.api401;
  if (error.status === 403) return d.api403;
  if (error.status === 404) return d.api404;
  if (error.status === 409) return d.api409;
  if (error.status === 503) return d.api503;
  return fallback;
}

function PlayerRow({ player, room, playerId }: { player: DaifugoRoomPlayer; room: DaifugoRoomView; playerId: string }) {
  const { locale } = useAppLocale();
  const d = daifugoText(locale);
  const rankNames = [d.rank1, d.rank2, d.rank3, d.rank4];
  const finishIndex = room.game?.finishOrder.indexOf(player.id) ?? -1;
  return <li className={`flex items-center gap-3 rounded-xl border p-3 ${player.id === playerId ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-white/[0.04]"}`}>
    <span className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-cover bg-center" style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }} aria-hidden="true" />
    <span className="min-w-0 flex-1 truncate font-bold">{player.name}{player.id === playerId ? d.you : ""}</span>
    {finishIndex >= 0 && <span className="rounded bg-amber-300 px-2 py-1 text-xs font-black text-slate-950">{rankNames[finishIndex] ?? `#${finishIndex + 1}`}</span>}
    {player.isDummy && <span className="rounded bg-cyan-200 px-2 py-1 text-xs font-black text-cyan-950">{d.dummy}</span>}
    {player.id === room.hostId && <span className="rounded bg-white/15 px-2 py-1 text-xs font-black">{d.host}</span>}
  </li>;
}

export function DaifugoGame() {
  const { locale } = useAppLocale();
  const d = daifugoText(locale);
  const rankNames = [d.rank1, d.rank2, d.rank3, d.rank4];
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [room, setRoom] = useState<DaifugoRoomView | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [choices, setChoices] = useState<DaifugoRoomChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [capacity, setCapacity] = useState(4);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const resultReturnGate = useRoomResultReturnGate({ room, setRoom, playerId: session?.id ?? "", resultPhase: "result", onReturnUnavailable: () => setError(d.returnUnavailable) });

  useEffect(() => {
    let active = true;
    if (!isPlayerAuthenticated()) {
      const timer = window.setTimeout(() => { if (active) setReady(true); }, 0);
      return () => { active = false; window.clearTimeout(timer); };
    }
    void loadPersistentPlayerSession().then(async (savedSession) => {
      if (!active || !savedSession?.id) return;
      setSession(savedSession);
      const savedRoom = await restoreOnlineRoom({ playerId: savedSession.id, lastCode: localStorage.getItem(lastRoomKey), fetchActiveRoom: daifugoRoomApi.fetchActiveRoom, fetchRoom: daifugoRoomApi.fetchRoom });
      if (active && savedRoom) setRoom(savedRoom);
    }).catch(() => undefined).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const playerId = session?.id ?? "";
  const roomCode = room?.code;
  const roomPhase = room?.phase;
  useOnlineRoomPolling({ game: "daifugo", roomCode: playerId && !resultReturnGate.isRoomDissolved ? roomCode : null, intervalMs: roomPhase === "lobby" ? onlineRoomPollingIntervals.idle : onlineRoomPollingIntervals.active, fetchRoom: (code) => daifugoRoomApi.fetchRoom(code, playerId), onRoom: resultReturnGate.acceptIncomingRoom, onMissing: () => { localStorage.removeItem(lastRoomKey); if (resultReturnGate.markRoomDissolved()) { setError(d.roomMissingResult); return; } setRoom(null); setError(d.roomMissing); } });

  const isHost = Boolean(room && room.hostId === playerId);
  const game = room?.game;
  const hand = useMemo(() => sortDaifugoHand(game?.hands[playerId] ?? []), [game?.hands, playerId]);
  const isMyTurn = game?.currentPlayerId === playerId && game.status === "playing";

  const runAction = useCallback(async (action: DaifugoRoomAction) => {
    if (!room || saving) return null;
    setSaving(true); setError("");
    try { const saved = await applyDaifugoRoomAction(room.code, action); setRoom(saved); setSelectedCardIds([]); return saved; }
    catch (caught) { setError(apiMessage(caught, d.actionFailed, d)); return null; }
    finally { setSaving(false); }
  }, [d, room, saving]);
  useRoomLobbyReturnConfirmation({ room, playerId, confirmReturn: () => runAction({ type: "confirm-lobby-return", actorId: playerId }) });

  useEffect(() => {
    if (!roomCode || !playerId || roomPhase !== "playing" || !room?.phaseStartedAt || room.turnTimeLimitSeconds <= 0) return;
    const startedAt = room.phaseStartedAt;
    const timer = window.setTimeout(() => void applyDaifugoRoomAction(roomCode, { type: "expire-turn", actorId: playerId, phaseStartedAt: startedAt }).then(setRoom).catch(() => undefined), Math.max(0, startedAt + room.turnTimeLimitSeconds * 1000 - Date.now()) + 100);
    return () => window.clearTimeout(timer);
  }, [playerId, room?.phaseStartedAt, room?.turnTimeLimitSeconds, roomCode, roomPhase]);

  const createRoom = async () => {
    if (!session?.id || saving) return;
    const now = Date.now();
    const host: DaifugoRoomPlayer = { id: session.id, name: session.name, joinedAt: now, avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
    const draft = { code: makeRoomCode(), hostId: session.id, ownerId: getOwnerId(), passphrase: passphrase.trim(), phase: "lobby" as const, players: [host], playerCapacity: capacity, turnTimeLimitSeconds: 0, revision: 0, createdAt: now, updatedAt: now, gameNumber: 1, gameStartedAt: null, phaseStartedAt: null, game: null, debugMode: false, debugReplayEnabled: false, debugLog: [], hasPassphrase: Boolean(passphrase.trim()) };
    setSaving(true); setError("");
    try { const data = await createDaifugoRoom(draft, session.id); setRoom(data.room); localStorage.setItem(lastRoomKey, data.room.code); }
    catch (caught) { setError(apiMessage(caught, d.createFailed, d)); }
    finally { setSaving(false); }
  };

  const joinRoom = async (selectedCode?: string) => {
    if (!session?.id || saving) return;
    const code = (selectedCode ?? joinCode).trim().toUpperCase();
    if (code.length !== 4) { setError(d.codeInvalid); return; }
    const player: DaifugoRoomPlayer = { id: session.id, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
    setSaving(true); setError("");
    try { const saved = await applyDaifugoRoomAction(code, { type: "join-room", actorId: session.id, player, passphrase }); setRoom(saved); setShowChoices(false); localStorage.setItem(lastRoomKey, saved.code); }
    catch (caught) { setError(apiMessage(caught, d.joinFailed, d)); }
    finally { setSaving(false); }
  };

  const listRooms = async () => { try { setChoices(await daifugoRoomApi.fetchJoinableRooms()); setShowChoices(true); } catch (caught) { setError(apiMessage(caught, d.listFailed, d)); } };
  const leaveRoom = async () => { if (!room) return; const saved = await runAction({ type: "leave-room", actorId: playerId }); if (saved) { setRoom(null); localStorage.removeItem(lastRoomKey); } };
  const dissolveRoom = async () => { if (!room || !confirm(d.confirmDissolve)) return; try { await daifugoRoomApi.remove({ code: room.code, actorId: playerId }); localStorage.removeItem(lastRoomKey); if (resultReturnGate.markRoomDissolved()) { setError(d.dissolvedResult); return; } setRoom(null); } catch (caught) { setError(apiMessage(caught, d.dissolveFailed, d)); } };
  const play = () => { if (!game) return; const message = daifugoPlayError(game, playerId, selectedCardIds); if (message) { setError(localizeDaifugoPlayError(message, locale)); return; } void runAction({ type: "play-cards", actorId: playerId, cardIds: selectedCardIds }); };

  if (!ready) return <main className="min-h-screen bg-slate-950 p-8 text-white">{d.checking}</main>;
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
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[280px_minmax(0,1fr)]"><aside className="space-y-4"><section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><h2 className="font-black">{d.participants} {room.players.length}/{room.playerCapacity}</h2><ul className="mt-3 space-y-2">{room.players.map((player) => <PlayerRow key={player.id} player={player} room={room} playerId={playerId} />)}</ul><RoomLobbyReturnStatus state={room.lobbyReturn} players={room.players} hostId={room.hostId} isHost={isHost} onRemoveWaitingPlayer={(player) => { if (window.confirm(formatDaifugoText(d.confirmRemove, { name: player.name }))) void runAction({ type: "remove-waiting-player", actorId: playerId, targetPlayerId: player.id }); }} /></section><RoomConfigSummary title={d.currentConfig} items={[{ label: d.capacity, value: `${room.playerCapacity}${d.people}` }, { label: d.passphrase, value: room.hasPassphrase ? d.yes : d.no }, { label: d.turnTime, value: timeLimitLabel(room.turnTimeLimitSeconds, d) }]} /></aside><div className="space-y-4">{error && <p className="rounded-xl bg-rose-300/10 p-3 font-bold text-rose-100">{error}</p>}
      {room.phase === "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">{d.beforeStart}</h2><p className="mt-2 text-slate-300">{d.startHelp}</p>{isHost && <div className="mt-5 rounded-xl bg-white/[0.05] p-4"><label className="text-sm font-bold">{d.capacity}<select value={room.playerCapacity} onChange={(event) => void runAction({ type: "set-config", actorId: playerId, playerCapacity: Number(event.target.value), turnTimeLimitSeconds: room.turnTimeLimitSeconds })} className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2">{Array.from({ length: daifugoMaximumPlayers - daifugoMinimumPlayers + 1 }, (_, index) => index + daifugoMinimumPlayers).map((count) => <option key={count}>{count}</option>)}</select></label><div className="mt-4 rounded-xl bg-white p-4 text-slate-950"><RoomTimeLimitControl label={d.oneTurnLimit} value={room.turnTimeLimitSeconds} onChange={(seconds) => void runAction({ type: "set-config", actorId: playerId, playerCapacity: room.playerCapacity, turnTimeLimitSeconds: seconds })} /></div></div>}{isHost && room.debugMode && <button type="button" disabled={room.players.length >= room.playerCapacity} onClick={() => void runAction({ type: "debug-add-player", actorId: playerId })} className="mt-4 w-full rounded-xl bg-cyan-200 p-3 font-black text-cyan-950 disabled:opacity-40">{d.addDummy}</button>}{isHost ? <button type="button" disabled={saving || room.players.length < daifugoMinimumPlayers || !allRoomPlayersReturned(room.lobbyReturn, room.players)} onClick={() => void runAction({ type: "start-game", actorId: playerId })} className="mt-4 w-full rounded-xl bg-amber-300 p-4 text-lg font-black text-slate-950 disabled:opacity-40">{!allRoomPlayersReturned(room.lobbyReturn, room.players) ? d.waitingReturn : room.players.length < daifugoMinimumPlayers ? d.needThree : d.startMembers}</button> : <p className="mt-5 text-center font-bold">{d.waitHost}</p>}</section>}
      {game && <><div className="flex justify-end">{room.phaseStartedAt && room.phase === "playing" && <GamePhaseTimer key={room.phaseStartedAt} durationSeconds={room.turnTimeLimitSeconds} startedAt={room.phaseStartedAt} label={d.turn} />}</div><DaifugoTable state={game} viewerId={playerId} handCounts={game.handCounts} /><section className={`rounded-2xl border bg-slate-950/85 p-5 ${isMyTurn ? "border-cyan-300" : "border-white/10"}`}><h2 className="text-xl font-black">{d.yourHand} <span className="text-sm text-slate-400">{hand.length}{d.cards}</span></h2>{hand.length ? <PlayingCardHand cards={hand} selectedCardIds={selectedCardIds} disabledCardIds={isMyTurn ? undefined : hand.map((card) => card.id)} size="sm" label={d.yourHandLabel} onCardClick={(card) => setSelectedCardIds((ids) => ids.includes(card.id) ? ids.filter((id) => id !== card.id) : [...ids, card.id])} /> : <p className="my-5 text-center font-bold text-amber-200">{d.handEmpty}</p>}<div className="flex justify-center gap-3 border-t border-white/10 pt-4"><button type="button" disabled={!isMyTurn || selectedCardIds.length === 0 || saving} onClick={play} className="rounded-xl bg-cyan-300 px-6 py-3 font-black text-slate-950 disabled:opacity-35">{d.playSelected}</button><button type="button" disabled={!game || !canPassDaifugoTurn(game, playerId) || saving} onClick={() => void runAction({ type: "pass", actorId: playerId })} className="rounded-xl border border-white/20 px-6 py-3 font-black disabled:opacity-35">{d.pass}</button></div></section></>}
      {room.phase === "result" && game && <section className="rounded-2xl border border-amber-300/30 bg-amber-50 p-6 text-slate-950"><h2 className="text-3xl font-black">{d.finished}</h2><ol className="mt-4 grid gap-2 sm:grid-cols-2">{game.finishOrder.map((id, index) => <li key={id} className="rounded-xl bg-white p-3 shadow"><b>#{index + 1} · {rankNames[index] ?? ""}</b>　{room.players.find((player) => player.id === id)?.name}</li>)}</ol><RoomResultActions canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={saving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : () => resultReturnGate.returnToRoom((code) => daifugoRoomApi.fetchRoom(code, playerId), () => setError(d.returnUnavailable))} onDissolve={isHost ? dissolveRoom : undefined} /></section>}{room.phase === "result" && game && <GameResultShareButton title={d.resultTitle} text={formatDaifugoText(d.resultText, { players: room.players.length, place: game.finishOrder.indexOf(playerId) + 1, turns: game.turnNumber })} url="/daifugo" />}
    </div></div>
  </main>;
}
