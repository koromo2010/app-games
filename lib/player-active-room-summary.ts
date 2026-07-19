export type PlayerActiveRoomSummarySource = {
  code: string;
  phase: string;
  players: Array<{ id: string; name: string }>;
  updatedAt: number;
};

export type PlayerActiveRoomSummary = PlayerActiveRoomSummarySource;

export function summarizePlayerActiveRoom(room: PlayerActiveRoomSummarySource | null): PlayerActiveRoomSummary | null {
  if (!room) return null;
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((player) => ({ id: player.id, name: player.name })),
    updatedAt: room.updatedAt,
  };
}
