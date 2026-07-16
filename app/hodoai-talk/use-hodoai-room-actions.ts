import { useCallback, type Dispatch, type SetStateAction } from "react";
import { applyHodoaiRoomAction, createHodoaiRoom, hodoaiRoomApi } from "./hodoai-room-api-client";
import { loadPlayerRoomDefaults, savePlayerRoomDefaults } from "@/lib/game-room-defaults-client";
import { OnlineRoomApiError } from "@/lib/online-room-api-client";
import type { PlayerSession } from "@/lib/player-session";
import { defaultHodoaiScoring, normalizeHodoaiConfig, type HodoaiConfig, type HodoaiPlayer, type HodoaiRoom, type HodoaiRoomAction, type HodoaiRoomChoice } from "@/lib/hodoai-talk";
import { hodoaiLastRoomKey } from "./use-hodoai-room-session";

const defaultsStorageKey = "hodoai-room-defaults-v2";
const ownerIdKey = "hodoai-owner-id";
const makeRoomCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();
function getOwnerId() { const saved = localStorage.getItem(ownerIdKey); if (saved) return saved; const created = crypto.randomUUID(); localStorage.setItem(ownerIdKey, created); return created; }
function normalizeDefaults(value: unknown) { return { ...normalizeHodoaiConfig(value), debugMode: false }; }
function apiMessage(status: number, fallback: string) {
  if (status === 401) return "合言葉が違います。";
  if (status === 403) return "この操作を行う権限がありません。";
  if (status === 404) return "部屋が見つかりません。";
  if (status === 409) return "部屋の状態が更新されました。もう一度お試しください。";
  if (status === 503) return "部屋サーバーを利用できません。少し待ってお試しください。";
  return fallback;
}

type Params = {
  room: HodoaiRoom | null;
  session: PlayerSession | null;
  passphrase: string;
  joinCode: string;
  isHost: boolean;
  markRoomDissolved: () => boolean;
  setRoom: Dispatch<SetStateAction<HodoaiRoom | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setChoices: Dispatch<SetStateAction<HodoaiRoomChoice[]>>;
  setShowChoices: Dispatch<SetStateAction<boolean>>;
};

export function useHodoaiRoomActions(params: Params) {
  const { room, session, passphrase, joinCode, isHost, markRoomDissolved, setRoom, setError, setIsSaving, setChoices, setShowChoices } = params;
  const runAction = useCallback(async (action: HodoaiRoomAction) => {
    if (!room) return null;
    setIsSaving(true);
    try { const saved = await applyHodoaiRoomAction(room.code, action); setRoom(saved); setError(""); return saved; }
    catch (caught) { setError(caught instanceof OnlineRoomApiError ? apiMessage(caught.status, "操作を保存できませんでした。") : "通信できませんでした。接続を確認してください。"); return null; }
    finally { setIsSaving(false); }
  }, [room, setError, setIsSaving, setRoom]);

  const createRoom = async () => {
    if (!session?.id) return; setIsSaving(true); const ownerId = getOwnerId();
    try {
      await hodoaiRoomApi.remove({ ownerId, fallbackHostId: session.id });
      const defaults = await loadPlayerRoomDefaults({ game: "hodoai-talk", playerId: session.id, localStorageKey: defaultsStorageKey, normalize: normalizeDefaults });
      const now = Date.now();
      const host: HodoaiPlayer = { id: session.id, name: session.name, joinedAt: now, avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
      const nextRoom: HodoaiRoom = { code: makeRoomCode(), revision: 0, hostId: session.id, sorterId: session.id, ownerId, passphrase: passphrase.trim(), phase: "lobby", players: [host], ...defaults, ...defaultHodoaiScoring, playerTimeouts: { [session.id]: { consecutiveTimeouts: 0, reducedTime: false } }, playerTimeoutNotice: null, debugMode: false, debugReplayEnabled: false, debugLog: [], gameNumber: 1, round: 1, theme: null, cards: [], values: {}, clues: {}, clueHistory: [], order: [], totalPoints: 0, history: [], phaseStartedAt: null, createdAt: now, updatedAt: now };
      const data = await createHodoaiRoom(nextRoom, session.id); setRoom(data.room); localStorage.setItem(hodoaiLastRoomKey, data.room.code); setError("");
    } catch (caught) { const status = caught instanceof OnlineRoomApiError ? caught.status : 0; setError(status === 409 ? "プレイ中の部屋があります。先にその部屋へ戻ってください。" : apiMessage(status, "部屋を作成できませんでした。")); }
    finally { setIsSaving(false); }
  };
  const listRooms = async () => { try { const rooms = await hodoaiRoomApi.fetchJoinableRooms(); setChoices(rooms); setShowChoices(true); setError(rooms.length ? "" : "参加できる未開始の部屋がありません。"); } catch (caught) { setError(apiMessage(caught instanceof OnlineRoomApiError ? caught.status : 0, "部屋一覧を取得できませんでした。")); } };
  const joinRoom = async (selectedCode = joinCode) => {
    if (!session?.id) return; const code = selectedCode.trim().toUpperCase(); if (!code) { setError("部屋コードを入力してください。"); return; }
    const player: HodoaiPlayer = { id: session.id, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true };
    setIsSaving(true); try { const joined = await applyHodoaiRoomAction(code, { type: "join-room", actorId: session.id, player, passphrase }); setRoom(joined); setShowChoices(false); localStorage.setItem(hodoaiLastRoomKey, joined.code); setError(""); } catch (caught) { setError(apiMessage(caught instanceof OnlineRoomApiError ? caught.status : 0, "部屋へ参加できませんでした。")); } finally { setIsSaving(false); }
  };
  const dissolveRoom = async () => { if (!room || !session?.id || !isHost || !window.confirm("部屋を解散しますか？")) return; try { await hodoaiRoomApi.remove({ code: room.code, actorId: session.id }); } catch { setError("部屋を解散できませんでした。"); return; } localStorage.removeItem(hodoaiLastRoomKey); if (markRoomDissolved()) { setError("部屋を解散しました。結果画面はこのまま確認できます。"); return; } setRoom(null); };
  const leaveRoom = async () => { if (!room || !session?.id || isHost) return; const saved = await runAction({ type: "leave-room", actorId: session.id }); if (saved) { setRoom(null); localStorage.removeItem(hodoaiLastRoomKey); } };
  const updateConfig = async (updates: Partial<Omit<HodoaiConfig, "debugMode">>) => { if (!room || !session?.id || !isHost) return; const config = normalizeHodoaiConfig({ ...room, ...updates, debugMode: room.debugMode }); const saved = await runAction({ type: "update-config", actorId: session.id, config: { roundsTotal: config.roundsTotal, cardsPerPlayer: config.cardsPerPlayer, clueTimeLimitSeconds: config.clueTimeLimitSeconds, arrangeTimeLimitSeconds: config.arrangeTimeLimitSeconds } }); if (saved) void savePlayerRoomDefaults({ game: "hodoai-talk", playerId: session.id, localStorageKey: defaultsStorageKey, defaults: normalizeDefaults(saved) }); };
  return { runAction, createRoom, listRooms, joinRoom, dissolveRoom, leaveRoom, updateConfig };
}
