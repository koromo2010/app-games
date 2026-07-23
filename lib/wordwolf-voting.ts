import type { Room } from "./wordwolf-game-types.ts";

function voteCandidateIds(room: Room) {
  return room.runoffCandidateIds?.length
    ? new Set(room.runoffCandidateIds)
    : new Set(room.players.map((player) => player.id));
}

function voteVoterIds(room: Room) {
  if (!room.runoffCandidateIds?.length || room.runoffCandidateIds.length >= 3) {
    return new Set(room.players.map((player) => player.id));
  }
  const candidateIds = new Set(room.runoffCandidateIds);
  return new Set(room.players.filter((player) => !candidateIds.has(player.id)).map((player) => player.id));
}

export function isValidWordWolfVoteTarget(room: Room, playerId: string, targetId: string) {
  return playerId !== targetId
    && voteVoterIds(room).has(playerId)
    && voteCandidateIds(room).has(targetId);
}

export function hasAcceptedWordWolfVote(room: Room, playerId: string) {
  return typeof room.votes[playerId] === "string" && room.votes[playerId].length > 0;
}
