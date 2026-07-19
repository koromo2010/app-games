import { useCallback, useEffect, useState } from "react";
import type { PlayerStatsGameFilter, PlayerStatsResponse } from "@/lib/player-stats-store";

export type ActiveWordWolfRoom = { code: string; phase: "lobby" | "clue" | "vote" | "wolfGuess" | "result"; players: { id: string; name: string }[]; updatedAt: number };
export type ActiveGameRoom = { code: string; phase: string; players: { id: string; name: string }[]; updatedAt: number };

export function useLobbyRoomData(playerId: string, isLoggedIn: boolean) {
  const [stats, setStats] = useState<PlayerStatsResponse | null>(null); const [isStatsLoading, setIsStatsLoading] = useState(false); const [selectedStatsGame, setSelectedStatsGame] = useState<PlayerStatsGameFilter>("all");
  const [activeGameRooms, setActiveGameRooms] = useState<Record<string, ActiveGameRoom>>({}); const [isActiveRoomLoading, setIsActiveRoomLoading] = useState(false);
  const loadStats = useCallback(async (id: string, filter: PlayerStatsGameFilter) => { if (!id) return; setIsStatsLoading(true); try { const query = new URLSearchParams({ playerId: id, gameType: filter }); const response = await fetch(`/api/player-stats?${query}`, { cache: "no-store" }); const data = await response.json() as { stats?: PlayerStatsResponse }; setStats(response.ok && data.stats ? data.stats : null); } catch { setStats(null); } finally { setIsStatsLoading(false); } }, []);
  const changeStatsGame = (filter: PlayerStatsGameFilter) => { setSelectedStatsGame(filter); if (playerId) void loadStats(playerId, filter); };
  const activeRoom = (activeGameRooms.wordwolf as ActiveWordWolfRoom | undefined) ?? null;
  const rememberActiveRoom = () => { if (!activeRoom || !playerId) return; localStorage.setItem("wordwolf-last-room", activeRoom.code); localStorage.setItem("wordwolf-last-player", playerId); };
  useEffect(() => {
    if (!isLoggedIn || !playerId) return;
    const controller = new AbortController();
    const loadingTimer = window.setTimeout(() => setIsActiveRoomLoading(true), 0);
    void fetch("/api/player-active-rooms", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? (await response.json() as { rooms?: Record<string, ActiveGameRoom> }).rooms ?? {} : {})
      .then((rooms) => { if (!controller.signal.aborted) setActiveGameRooms(rooms); })
      .catch(() => { if (!controller.signal.aborted) setActiveGameRooms({}); })
      .finally(() => { if (!controller.signal.aborted) setIsActiveRoomLoading(false); });
    return () => { window.clearTimeout(loadingTimer); controller.abort(); };
  }, [isLoggedIn, playerId]);
  const clearRoomData = () => { setStats(null); setActiveGameRooms({}); };
  return { stats, isStatsLoading, selectedStatsGame, activeRoom, activeGameRooms, isActiveRoomLoading, loadStats, changeStatsGame, rememberActiveRoom, clearRoomData };
}
