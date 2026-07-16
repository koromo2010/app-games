import { useCallback, useEffect, useState } from "react";
import type { PlayerStatsGameFilter, PlayerStatsResponse } from "@/lib/player-stats-store";
import { gameOperationFor, type GameOperation } from "@/lib/game-operations";
import { games } from "./game-catalog";

export type ActiveWordWolfRoom = { code: string; phase: "lobby" | "clue" | "vote" | "wolfGuess" | "result"; players: { id: string; name: string }[]; updatedAt: number };
export type ActiveGameRoom = { code: string; phase: string; players: { id: string; name: string }[]; updatedAt: number };
const roomApis: Partial<Record<string, string>> = { wordwolf: "/api/wordwolf/rooms", tahoiya: "/api/tahoiya/rooms", "northern-branch": "/api/northern-branch/rooms", hodoai: "/api/hodoai/rooms", "kotoba-senpuku": "/api/kotoba-senpuku/rooms", nigoichi: "/api/nigoichi/rooms", "code-intercept": "/api/code-intercept/rooms" };

async function fetchActiveRooms(playerId: string, includePrivate: boolean, operations: GameOperation[]) {
  const accessible = games.filter((game) => { const operation = gameOperationFor(operations, game.id); return operation.publication !== "hidden" && !operation.maintenance && (operation.publication === "public" || includePrivate); });
  const entries = await Promise.all(accessible.map(async (game) => { const endpoint = roomApis[game.id]; if (!endpoint) return null; try { const response = await fetch(`${endpoint}?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store" }); const data = await response.json() as { room?: ActiveGameRoom | null }; return response.ok && data.room ? [game.id, data.room] as const : null; } catch { return null; } }));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, ActiveGameRoom] => entry !== null));
}

export function useLobbyRoomData(playerId: string, isLoggedIn: boolean, privateUnlocked: boolean, operations: GameOperation[]) {
  const [stats, setStats] = useState<PlayerStatsResponse | null>(null); const [isStatsLoading, setIsStatsLoading] = useState(false); const [selectedStatsGame, setSelectedStatsGame] = useState<PlayerStatsGameFilter>("all");
  const [activeRoom, setActiveRoom] = useState<ActiveWordWolfRoom | null>(null); const [activeGameRooms, setActiveGameRooms] = useState<Record<string, ActiveGameRoom>>({}); const [isActiveRoomLoading, setIsActiveRoomLoading] = useState(false);
  const loadStats = useCallback(async (id: string, filter: PlayerStatsGameFilter) => { if (!id) return; setIsStatsLoading(true); try { const query = new URLSearchParams({ playerId: id, gameType: filter }); const response = await fetch(`/api/player-stats?${query}`, { cache: "no-store" }); const data = await response.json() as { stats?: PlayerStatsResponse }; setStats(response.ok && data.stats ? data.stats : null); } catch { setStats(null); } finally { setIsStatsLoading(false); } }, []);
  const loadActiveRoom = useCallback(async (id: string) => { if (!id) return; setIsActiveRoomLoading(true); try { const response = await fetch(`/api/wordwolf/rooms?playerId=${encodeURIComponent(id)}`, { cache: "no-store" }); const data = await response.json() as { room?: ActiveWordWolfRoom | null }; setActiveRoom(response.ok && data.room ? data.room : null); } catch { setActiveRoom(null); } finally { setIsActiveRoomLoading(false); } }, []);
  const changeStatsGame = (filter: PlayerStatsGameFilter) => { setSelectedStatsGame(filter); if (playerId) void loadStats(playerId, filter); };
  const rememberActiveRoom = () => { if (!activeRoom || !playerId) return; localStorage.setItem("wordwolf-last-room", activeRoom.code); localStorage.setItem("wordwolf-last-player", playerId); };
  useEffect(() => { if (!isLoggedIn || !playerId) return; let ignore = false; void fetchActiveRooms(playerId, privateUnlocked, operations).then((rooms) => { if (!ignore) setActiveGameRooms(rooms); }); return () => { ignore = true; }; }, [isLoggedIn, operations, playerId, privateUnlocked]);
  const clearRoomData = () => { setStats(null); setActiveRoom(null); setActiveGameRooms({}); };
  return { stats, isStatsLoading, selectedStatsGame, activeRoom, activeGameRooms, isActiveRoomLoading, loadStats, loadActiveRoom, changeStatsGame, rememberActiveRoom, clearRoomData };
}
