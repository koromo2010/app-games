import type { Phase, Room } from "./wordwolf-game-types.ts";

export type WordWolfCommandType =
  | "start-game"
  | "submit-clue"
  | "cast-vote"
  | "submit-wolf-guess";

export type WordWolfCommandScope = {
  revision: number;
  gameNumber: number;
  phase: Phase;
  currentRound: number;
  phaseStartedAt: number | null;
};

const phases = new Set<Phase>(["lobby", "clue", "vote", "wolfGuess", "result"]);

export function createWordWolfCommandScope(room: Room): WordWolfCommandScope {
  return {
    revision: room.revision,
    gameNumber: room.gameNumber,
    phase: room.phase,
    currentRound: room.currentRound,
    phaseStartedAt: room.currentTurnStartedAt,
  };
}

export function isWordWolfCommandScope(value: unknown): value is WordWolfCommandScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Partial<WordWolfCommandScope>;
  return Number.isInteger(scope.revision)
    && Number(scope.revision) >= 0
    && Number.isInteger(scope.gameNumber)
    && Number(scope.gameNumber) >= 1
    && typeof scope.phase === "string"
    && phases.has(scope.phase as Phase)
    && Number.isInteger(scope.currentRound)
    && Number(scope.currentRound) >= 1
    && (scope.phaseStartedAt === null || (typeof scope.phaseStartedAt === "number" && Number.isFinite(scope.phaseStartedAt)));
}

export function wordWolfCommandScopeMatches(
  room: Room,
  scope: WordWolfCommandScope,
  type: WordWolfCommandType,
) {
  if (room.gameNumber !== scope.gameNumber || room.phase !== scope.phase) return false;
  if (type === "start-game") return room.revision === scope.revision && room.phase === "lobby";
  return room.currentRound === scope.currentRound && room.currentTurnStartedAt === scope.phaseStartedAt;
}

export function wordWolfCommandAlreadyApplied(
  room: Room,
  scope: WordWolfCommandScope,
  type: WordWolfCommandType,
  actorId: string,
) {
  if (room.gameNumber !== scope.gameNumber) return false;
  if (type === "start-game") return room.phase !== "lobby";
  if (type === "submit-clue") {
    return room.clues.some((clue) => clue.round === scope.currentRound && clue.playerId === actorId);
  }
  if (type === "cast-vote") {
    if (typeof room.votes[actorId] === "string" && room.votes[actorId].length > 0) return true;
    const startedAt = scope.phaseStartedAt ?? 0;
    return room.voteHistory.some((round) => round.at >= startedAt && typeof round.votes[actorId] === "string");
  }
  return room.phase === "result" && Boolean(room.wolfGuess);
}
