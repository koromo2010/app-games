import type { Room } from "@/lib/wordwolf-game-types";

export type WordWolfViewPermissions = {
  isHost: boolean;
  canStartGame: boolean;
  canEditRoomSettings: boolean;
  canVote: boolean;
  canSubmitClue: boolean;
  canSubmitFinalAnswer: boolean;
  canAbort: boolean;
  canDebug: boolean;
  canDissolve: boolean;
  canSeeSecret: boolean;
};

export function createWordWolfViewPermissions(input: {
  room: Room | null;
  playerAccountId: string;
  isMyClueTurn: boolean;
  isMyVoteTurn: boolean;
  isMyFinalAnswerTurn: boolean;
  canSubmitClue: boolean;
  ownWord: string;
}): WordWolfViewPermissions {
  const { room, playerAccountId } = input;
  const isHost = Boolean(room && playerAccountId === room.hostId);
  const isLobby = room?.phase === "lobby";

  return {
    isHost,
    canStartGame: isHost && isLobby,
    canEditRoomSettings: isHost && isLobby,
    canVote: input.isMyVoteTurn,
    canSubmitClue: input.isMyClueTurn && input.canSubmitClue,
    canSubmitFinalAnswer: input.isMyFinalAnswerTurn,
    canAbort: isHost && Boolean(room?.debugMode) && Boolean(room && !isLobby),
    canDebug: isHost,
    canDissolve: isHost,
    canSeeSecret: Boolean(input.ownWord),
  };
}
