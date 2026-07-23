"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { onlineRoomPollingIntervals, useOnlineRoomPolling } from "@/app/hooks/use-online-room-polling";
import { useRoomResultReturnGate } from "@/app/hooks/use-room-result-return-gate";
import { useRoomLobbyReturnConfirmation } from "@/app/hooks/use-room-lobby-return-confirmation";
import { applyDaifugoRoomAction, createDaifugoRoom, daifugoRoomApi } from "./daifugo-room-api-client";
import { daifugoPlayError, sortDaifugoHand } from "@/lib/daifugo";
import { type DaifugoRoomAction, type DaifugoRoomChoice, type DaifugoRoomPlayer, type DaifugoRoomView } from "@/lib/daifugo-room";
import { OnlineRoomApiError, restoreOnlineRoom } from "@/lib/online-room-api-client";
import { isPlayerAuthenticated, loadPersistentPlayerSession, type PlayerSession } from "@/lib/player-session";
import { daifugoText, localizeDaifugoPlayError, type DaifugoCopy } from "./daifugo-i18n";

const lastRoomKey = "daifugo-last-room";
const ownerIdKey = "daifugo-owner-id";
function makeRoomCode() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }
function getOwnerId() { const saved = localStorage.getItem(ownerIdKey); if (saved) return saved; const value = crypto.randomUUID(); localStorage.setItem(ownerIdKey, value); return value; }
function apiMessage(error: unknown, fallback: string, d: DaifugoCopy) {
  if (!(error instanceof OnlineRoomApiError)) return fallback;
  if (error.status === 401) return d.api401;
  if (error.status === 403) return d.api403;
  if (error.status === 404) return d.api404;
  if (error.status === 409) return d.api409;
  if (error.status === 503) return d.api503;
  return fallback;
}

export function useDaifugoController() {
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
  const [debugControlledPlayerId, setDebugControlledPlayerId] = useState("");
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
  const controlledPlayer = room?.players.find((player) => player.id === debugControlledPlayerId && player.isDummy);
  const controlledPlayerId = isHost && room?.debugMode && controlledPlayer ? controlledPlayer.id : playerId;
  const controlledPlayerName = room?.players.find((player) => player.id === controlledPlayerId)?.name ?? session?.name ?? "";
  const hand = useMemo(() => sortDaifugoHand(game?.hands[controlledPlayerId] ?? []), [controlledPlayerId, game?.hands]);
  const isControlledTurn = game?.currentPlayerId === controlledPlayerId && game.status === "playing";

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
  const play = () => { if (!game) return; const message = daifugoPlayError(game, controlledPlayerId, selectedCardIds); if (message) { setError(localizeDaifugoPlayError(message, locale)); return; } void runAction({ type: "play-cards", actorId: playerId, playerId: controlledPlayerId === playerId ? undefined : controlledPlayerId, cardIds: selectedCardIds }); };
  const pass = () => void runAction({ type: "pass", actorId: playerId, playerId: controlledPlayerId === playerId ? undefined : controlledPlayerId });


  const returnToRoom = () => resultReturnGate.returnToRoom(
    (code) => daifugoRoomApi.fetchRoom(code, playerId),
    () => setError(d.returnUnavailable),
  );

  return {
    state: {
      session, room, ready, error, passphrase, joinCode, choices, showChoices,
      capacity, selectedCardIds, debugControlledPlayerId, saving, rulesOpen,
    },
    setters: {
      setPassphrase, setJoinCode, setCapacity, setSelectedCardIds,
      setDebugControlledPlayerId, setRulesOpen,
    },
    viewModel: {
      locale, d, rankNames, playerId, game, controlledPlayerId,
      controlledPlayerName, hand, isControlledTurn,
    },
    permissions: { isHost },
    actions: {
      runAction, createRoom, joinRoom, listRooms, leaveRoom, dissolveRoom,
      play, pass, returnToRoom,
    },
    result: resultReturnGate,
  };
}

export type DaifugoController = ReturnType<typeof useDaifugoController>;
