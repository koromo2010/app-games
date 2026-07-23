import {
  createGameSdkOnlineRoomModule,
  defineGameSdkOnlineRoomAppSet,
} from "@game-fields/game-sdk/runtime";
import {
  allGameSdkParticipantsComplete,
  assertGameSdkCanStart,
  assignGameSdkRoles,
  gameSdkPlayerSeat,
  gameSdkPlayerSeats,
  recordGameSdkVote,
  tallyGameSdkVotes,
} from "@game-fields/game-sdk/modules";
import {
  emptyWordWolfSdkState,
  normalizeWordWolfSdkSettings,
  type WordWolfSdkAppCommand,
  type WordWolfSdkAppInput,
  type WordWolfSdkAppState,
  type WordWolfSdkSettings,
} from "./domain.ts";
import { wordWolfSdkManifest } from "./manifest.ts";

export type WordWolfSdkAppView = {
  currentRound: number;
  clues: Array<{
    seat: number;
    round: number;
    text: string;
    at: number;
  }>;
  votesSubmittedSeats: number[];
  accusedSeat: number | null;
  winner: WordWolfSdkAppState["winner"];
  myWord?: string;
  actions: {
    canSubmitClue: boolean;
    canVote: boolean;
    canGuess: boolean;
  };
};

export const wordWolfSdkAppSet = defineGameSdkOnlineRoomAppSet<
  WordWolfSdkSettings,
  WordWolfSdkAppState,
  WordWolfSdkAppInput,
  WordWolfSdkAppCommand,
  WordWolfSdkAppView
>({
  manifest: wordWolfSdkManifest,
  defaultSettings: {
    roundsTotal: 1,
    wolfCount: 1,
    clueMode: "turn",
  },
  normalizeSettings: normalizeWordWolfSdkSettings,

  createAppState(input) {
    return emptyWordWolfSdkState(input.topic);
  },

  resetAppState(room) {
    return emptyWordWolfSdkState({
      villageWord: room.app.villageWord,
      wolfWord: room.app.wolfWord,
    });
  },

  applyAppCommand(room, command, context) {
    const app = room.app;
    if (command.type === "wordwolf/start") {
      assertGameSdkCanStart({
        actorId: context.actor.playerId,
        hostId: room.hostPlayerId,
        phase: room.phase,
        participantCount: room.players.length,
        minimumPlayers: wordWolfSdkManifest.minimumPlayers,
      });
      const wolfCount = Math.min(
        room.settings.wolfCount,
        Math.floor((room.players.length - 1) / 2),
      );
      const roles = assignGameSdkRoles(
        room.players.map((player) => player.id),
        { wolf: wolfCount },
        "village",
      );
      return {
        phase: "clue",
        app: {
          ...app,
          currentRound: 1,
          wolfIds: room.players
            .filter((player) => roles[player.id] === "wolf")
            .map((player) => player.id),
        },
      };
    }
    if (command.type === "wordwolf/submit-clue") {
      if (room.phase !== "clue") throw new Error("CLUE_PHASE_REQUIRED");
      if (app.clues.some((clue) => (
        clue.round === app.currentRound
        && clue.playerId === context.actor.playerId
      ))) {
        throw new Error("CLUE_ALREADY_SUBMITTED");
      }
      const text = command.text.trim().slice(0, 500);
      if (!text) throw new Error("CLUE_REQUIRED");
      const clues = [...app.clues, {
        playerId: context.actor.playerId,
        round: app.currentRound,
        text,
        at: context.now,
      }];
      const roundComplete = allGameSdkParticipantsComplete(
        room.players.map((player) => player.id),
        (playerId) => clues.some((clue) => (
          clue.round === app.currentRound
          && clue.playerId === playerId
        )),
      );
      const isLastRound = app.currentRound >= room.settings.roundsTotal;
      return {
        phase: roundComplete && isLastRound ? "vote" : "clue",
        app: {
          ...app,
          clues,
          currentRound: roundComplete && !isLastRound
            ? app.currentRound + 1
            : app.currentRound,
        },
      };
    }
    if (command.type === "wordwolf/vote") {
      if (room.phase !== "vote") throw new Error("VOTE_PHASE_REQUIRED");
      const target = Number.isInteger(command.targetSeat)
        ? room.players[command.targetSeat]
        : undefined;
      if (!target) throw new Error("INVALID_VOTE_TARGET");
      const participantIds = room.players.map((player) => player.id);
      const votes = recordGameSdkVote(
        app.votes,
        context.actor.playerId,
        target.id,
        {
          voterIds: participantIds,
          targetIds: participantIds,
          allowSelfVote: true,
        },
      ) as Record<string, string>;
      if (!allGameSdkParticipantsComplete(
        participantIds,
        (playerId) => Boolean(votes[playerId]),
      )) {
        return {
          phase: "vote",
          app: { ...app, votes },
        };
      }
      const tally = tallyGameSdkVotes(votes, participantIds);
      const accusedId = tally.leaderIds[0] ?? null;
      const wolfWasAccused = app.wolfIds.includes(accusedId ?? "");
      return {
        phase: wolfWasAccused ? "wolfGuess" : "result",
        app: {
          ...app,
          votes,
          accusedId,
          winner: wolfWasAccused ? null : "wolf",
        },
      };
    }
    if (command.type === "wordwolf/guess") {
      if (
        room.phase !== "wolfGuess"
        || !app.wolfIds.includes(context.actor.playerId)
      ) {
        throw new Error("WOLF_GUESS_REQUIRED");
      }
      const correct = command.answer.trim() === app.villageWord;
      return {
        phase: "result",
        app: {
          ...app,
          winner: correct ? "wolf" : "village",
        },
      };
    }
    throw new Error("UNKNOWN_COMMAND");
  },

  presentApp(room, context) {
    const playerId = context.viewer.playerId;
    const isParticipant = Boolean(
      playerId
      && room.players.some((player) => player.id === playerId),
    );
    const canSeeWord = (
      room.phase !== "lobby"
      && room.phase !== "result"
      && isParticipant
    );
    return {
      view: {
        currentRound: room.app.currentRound,
        clues: room.app.clues.map((clue) => ({
          seat: gameSdkPlayerSeat(room.players, clue.playerId),
          round: clue.round,
          text: clue.text,
          at: clue.at,
        })),
        votesSubmittedSeats: gameSdkPlayerSeats(
          room.players,
          Object.keys(room.app.votes),
        ),
        accusedSeat: room.app.accusedId
          ? gameSdkPlayerSeat(room.players, room.app.accusedId)
          : null,
        winner: room.app.winner,
        ...(canSeeWord ? {
          myWord: room.app.wolfIds.includes(playerId ?? "")
            ? room.app.wolfWord
            : room.app.villageWord,
        } : {}),
        actions: {
          canSubmitClue: (
            isParticipant
            && room.phase === "clue"
            && !room.app.clues.some((clue) => (
              clue.round === room.app.currentRound
              && clue.playerId === playerId
            ))
          ),
          canVote: (
            isParticipant
            && room.phase === "vote"
            && !room.app.votes[playerId ?? ""]
          ),
          canGuess: Boolean(
            playerId
            && room.phase === "wolfGuess"
            && room.app.wolfIds.includes(playerId),
          ),
        },
      },
      canSeeSecret: canSeeWord,
    };
  },
});

export const wordWolfSdkServerModule = createGameSdkOnlineRoomModule(
  wordWolfSdkAppSet,
);
