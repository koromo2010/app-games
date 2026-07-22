import { advanceGameSdkRoom, applyGameSdkRoomLifecycleCommand, defineGameServerModule } from "@game-fields/game-sdk/runtime";
import type { GameSdkViewPermissions } from "@game-fields/game-sdk";
import { emptyWordWolfSdkState, normalizeWordWolfSdkSettings, type WordWolfSdkCommand, type WordWolfSdkCreateInput, type WordWolfSdkRoom } from "./domain.ts";
import { wordWolfSdkManifest } from "./manifest.ts";

export type WordWolfSdkRoomView = {
  phase: WordWolfSdkRoom["phase"];
  players: WordWolfSdkRoom["players"];
  settings: WordWolfSdkRoom["settings"];
  currentRound: number;
  clues: WordWolfSdkRoom["clues"];
  votesSubmitted: string[];
  accusedId: string | null;
  winner: WordWolfSdkRoom["winner"];
  myWord?: string;
  permissions: GameSdkViewPermissions & { canSubmitClue: boolean; canVote: boolean; canGuess: boolean };
};

const resetGame = (room: Readonly<WordWolfSdkRoom>) => ({
  ...emptyWordWolfSdkState({ villageWord: room.villageWord, wolfWord: room.wolfWord }),
});

export const wordWolfSdkServerModule = defineGameServerModule<WordWolfSdkRoom, WordWolfSdkCreateInput, WordWolfSdkCommand, WordWolfSdkRoomView>({
  manifest: wordWolfSdkManifest,
  createRoom(input, context) {
    const settings = normalizeWordWolfSdkSettings({ roundsTotal: input.settings?.roundsTotal ?? 1, wolfCount: input.settings?.wolfCount ?? 1, clueMode: input.settings?.clueMode ?? "turn" });
    return {
      code: context.roomCode,
      revision: 1,
      phase: "lobby",
      hostPlayerId: context.actor.playerId,
      players: [{ id: context.actor.playerId, displayName: context.actor.displayName, joinedAt: context.now, connected: true }],
      settings,
      ...emptyWordWolfSdkState(input.topic),
    };
  },
  applyCommand(room, command, context) {
    const lifecycle = applyGameSdkRoomLifecycleCommand(room, command, context, {
      minimumPlayers: wordWolfSdkManifest.minimumPlayers,
      maximumPlayers: wordWolfSdkManifest.maximumPlayers,
      normalizeSettings: normalizeWordWolfSdkSettings,
      resetGame,
    });
    if (lifecycle.handled) return lifecycle.room;
    if (!room.players.some((player) => player.id === context.actor.playerId)) throw new Error("PLAYER_NOT_IN_ROOM");
    if (command.type === "wordwolf/start") {
      if (context.actor.playerId !== room.hostPlayerId) throw new Error("HOST_REQUIRED");
      if (room.phase !== "lobby") throw new Error("LOBBY_REQUIRED");
      if (room.players.length < wordWolfSdkManifest.minimumPlayers) throw new Error("NOT_ENOUGH_PLAYERS");
      const wolfCount = Math.min(room.settings.wolfCount, Math.floor((room.players.length - 1) / 2));
      return advanceGameSdkRoom(room, { phase: "clue", currentRound: 1, wolfIds: room.players.slice(-wolfCount).map((player) => player.id) });
    }
    if (command.type === "wordwolf/submit-clue") {
      if (room.phase !== "clue") throw new Error("CLUE_PHASE_REQUIRED");
      if (room.clues.some((clue) => clue.round === room.currentRound && clue.playerId === context.actor.playerId)) throw new Error("CLUE_ALREADY_SUBMITTED");
      const text = command.text.trim().slice(0, 500);
      if (!text) throw new Error("CLUE_REQUIRED");
      const clues = [...room.clues, { playerId: context.actor.playerId, round: room.currentRound, text, at: context.now }];
      const roundComplete = room.players.every((player) => clues.some((clue) => clue.round === room.currentRound && clue.playerId === player.id));
      const isLastRound = room.currentRound >= room.settings.roundsTotal;
      return advanceGameSdkRoom(room, { clues, ...(roundComplete ? (isLastRound ? { phase: "vote" as const } : { currentRound: room.currentRound + 1 }) : {}) });
    }
    if (command.type === "wordwolf/vote") {
      if (room.phase !== "vote") throw new Error("VOTE_PHASE_REQUIRED");
      if (room.votes[context.actor.playerId]) throw new Error("VOTE_ALREADY_SUBMITTED");
      if (!room.players.some((player) => player.id === command.targetPlayerId)) throw new Error("INVALID_VOTE_TARGET");
      const votes = { ...room.votes, [context.actor.playerId]: command.targetPlayerId };
      if (Object.keys(votes).length < room.players.length) return advanceGameSdkRoom(room, { votes });
      const counts = room.players.map((player) => ({ id: player.id, count: Object.values(votes).filter((id) => id === player.id).length }));
      const max = Math.max(...counts.map((item) => item.count));
      const accusedId = counts.find((item) => item.count === max)?.id ?? null;
      return advanceGameSdkRoom(room, room.wolfIds.includes(accusedId ?? "") ? { votes, accusedId, phase: "wolfGuess" } : { votes, accusedId, phase: "result", winner: "wolf" });
    }
    if (command.type === "wordwolf/guess") {
      if (room.phase !== "wolfGuess" || !room.wolfIds.includes(context.actor.playerId)) throw new Error("WOLF_GUESS_REQUIRED");
      const correct = command.answer.trim() === room.villageWord;
      return advanceGameSdkRoom(room, { phase: "result", winner: correct ? "wolf" : "village" });
    }
    throw new Error("UNKNOWN_COMMAND");
  },
  presentRoom(room, context) {
    const playerId = context.viewer.playerId;
    const isParticipant = Boolean(playerId && room.players.some((player) => player.id === playerId));
    const isHost = playerId === room.hostPlayerId;
    const canSeeWord = room.phase !== "lobby" && room.phase !== "result" && isParticipant;
    return {
      phase: room.phase,
      players: room.players,
      settings: room.settings,
      currentRound: room.currentRound,
      clues: room.clues,
      votesSubmitted: Object.keys(room.votes),
      accusedId: room.accusedId,
      winner: room.winner,
      ...(canSeeWord ? { myWord: room.wolfIds.includes(playerId ?? "") ? room.wolfWord : room.villageWord } : {}),
      permissions: {
        canStartGame: isHost && room.phase === "lobby" && room.players.length >= wordWolfSdkManifest.minimumPlayers,
        canEditRoomSettings: isHost && room.phase === "lobby",
        canAbort: isHost && room.phase !== "lobby",
        canDebug: context.viewer.debugAccess,
        canSeeSecret: canSeeWord,
        canSubmitClue: isParticipant && room.phase === "clue" && !room.clues.some((clue) => clue.round === room.currentRound && clue.playerId === playerId),
        canVote: isParticipant && room.phase === "vote" && !room.votes[playerId ?? ""],
        canGuess: Boolean(playerId && room.phase === "wolfGuess" && room.wolfIds.includes(playerId)),
      },
    };
  },
});
