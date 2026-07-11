import type { Clue, Player, Room, VoteRound } from "@/lib/wordwolf-game-types";

export const abstainVoteId = "__abstain__";

export function shufflePlayers(players: Player[]) {
  const shuffled = [...players];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function pickWolves(players: Player[], count: number) {
  const wolfCount = Math.max(0, Math.min(players.length, Math.floor(count)));
  return shufflePlayers(players).slice(0, wolfCount);
}

export function createClue(playerId: string, round: number, text: string): Clue {
  return { playerId, round, text, at: Date.now() };
}

export function getRunoffCandidates(room: Room) {
  if (!room.runoffCandidateIds?.length) return room.players;

  const candidateIds = new Set(room.runoffCandidateIds);
  return room.players.filter((player) => candidateIds.has(player.id));
}

export function getClueParticipants(room: Room) {
  return room.phase === "clue" && room.runoffCandidateIds?.length ? getRunoffCandidates(room) : room.players;
}

export function getFirstClueTurnIndex(room: Room) {
  const firstParticipant = getClueParticipants(room)[0];
  return firstParticipant ? Math.max(0, room.players.findIndex((player) => player.id === firstParticipant.id)) : 0;
}

export function getNextClueTurn(room: Room) {
  const participants = getClueParticipants(room);
  const currentPlayer = room.players[room.currentTurnIndex];
  const currentParticipantIndex = Math.max(
    0,
    participants.findIndex((player) => player.id === currentPlayer?.id),
  );
  const isLastPlayer = currentParticipantIndex >= participants.length - 1;
  const nextParticipant = isLastPlayer ? participants[0] : participants[currentParticipantIndex + 1];

  return {
    isLastPlayer,
    nextTurnIndex: nextParticipant ? Math.max(0, room.players.findIndex((player) => player.id === nextParticipant.id)) : 0,
  };
}

export function hasPostedClueThisRound(room: Room, playerId: string) {
  return room.clues.some((clue) => clue.round === room.currentRound && clue.playerId === playerId);
}

export function getClueSubmittedCount(room: Room) {
  return getClueParticipants(room).filter((player) => hasPostedClueThisRound(room, player.id)).length;
}

export function getNextSimultaneousCluePlayer(room: Room) {
  return getClueParticipants(room).find((player) => !hasPostedClueThisRound(room, player.id)) ?? null;
}

export function getVoteCandidates(room: Room) {
  if (!room.runoffCandidateIds?.length) return room.players;

  const candidateIds = new Set(room.runoffCandidateIds);
  return room.players.filter((player) => candidateIds.has(player.id));
}

export function getVoteVoters(room: Room) {
  if (!room.runoffCandidateIds?.length) return room.players;

  const candidateIds = new Set(room.runoffCandidateIds);
  return room.players.filter((player) => !candidateIds.has(player.id));
}

export function getVoteCounts(room: Room, votes = room.votes) {
  return getVoteCandidates(room).map((player) => ({
    playerId: player.id,
    count: Object.values(votes).filter((vote) => vote === player.id).length,
  }));
}

export function getTopVoteTargetIds(room: Room, votes = room.votes) {
  const counts = getVoteCounts(room, votes);
  const max = Math.max(...counts.map((item) => item.count), 0);
  if (max === 0) return [];
  return counts.filter((item) => item.count === max).map((item) => item.playerId);
}

export function getVoteTarget(room: Room, votes = room.votes) {
  const top = getTopVoteTargetIds(room, votes);
  return top.length === 1 ? top[0] : null;
}

export function createVoteRound(room: Room, votes: Record<string, string>): VoteRound {
  return {
    round: room.voteHistory.length + 1,
    votes,
    candidateIds: getVoteCandidates(room).map((player) => player.id),
    at: Date.now(),
  };
}

export function getNextVotePlayer(room: Room) {
  return getVoteVoters(room).find((player) => !room.votes[player.id]) ?? null;
}
