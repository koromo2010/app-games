export type GameTimerEvent = {
  game: string;
  roomCode: string;
  phase: string;
  revision: number;
  startedAt: number | null;
};

export function createGameTimerEventId(event: GameTimerEvent) {
  return [event.game, event.roomCode, event.phase, event.revision, event.startedAt ?? 0].join(":");
}
