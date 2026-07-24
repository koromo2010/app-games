import {
  createGameSdkOnlineRoomModule,
  defineGameSdkOnlineRoomAppSet,
  type GameSdkOnlineRoom,
} from "@game-fields/game-sdk/runtime";
import {
  allGameSdkParticipantsComplete,
  assertGameSdkCanStart,
  assignGameSdkRoles,
  gameSdkPlayerSeat,
  gameSdkPlayerSeats,
  recordGameSdkVote,
  tallyGameSdkVotes,
  defineGameSdkStandardResult,
} from "@game-fields/game-sdk/modules";
import { requireGameSdkContentSource } from "@game-fields/game-sdk/resources";
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

function wordWolfSdkStandardResult(
  room: Readonly<GameSdkOnlineRoom<WordWolfSdkSettings, WordWolfSdkAppState>>,
  winner: NonNullable<WordWolfSdkAppState["winner"]>,
) {
  const winnerIds = room.players
    .filter((player) => (
      winner === "wolf"
        ? room.app.wolfIds.includes(player.id)
        : !room.app.wolfIds.includes(player.id)
    ))
    .map((player) => player.id);
  return defineGameSdkStandardResult({
    winnerIds,
    rankings: room.players.map((player) => {
      const won = winnerIds.includes(player.id);
      return {
        participantId: player.id,
        rank: won ? 1 : 2,
        score: won ? 1 : 0,
      };
    }),
    reason: winner === "wolf" ? "wolf-win" : "village-win",
  }, {
    participantIds: room.players.map((player) => player.id),
  });
}

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
    timeLimitSeconds: 60,
  },
  normalizeSettings: normalizeWordWolfSdkSettings,
  timer: {
    durationSeconds(settings) {
      return settings.timeLimitSeconds;
    },
  },
  expireAppTurn(room, context) {
    const participantIds = room.players.map((player) => player.id);
    if (room.phase === "clue") {
      const missingIds = participantIds.filter((playerId) => (
        !room.app.clues.some((clue) => (
          clue.round === room.app.currentRound
          && clue.playerId === playerId
        ))
      ));
      const timedOutPlayerIds = room.settings.clueMode === "simultaneous"
        ? missingIds
        : [room.timer?.ownerPlayerId ?? missingIds[0]].filter(
            (playerId): playerId is string => Boolean(playerId),
          );
      if (timedOutPlayerIds.length === 0) {
        throw new Error("TIMER_TIMEOUT_PLAYERS_INVALID");
      }
      const clues = [
        ...room.app.clues,
        ...timedOutPlayerIds.map((playerId) => ({
          playerId,
          round: room.app.currentRound,
          text: "（時間切れ）",
          at: context.now,
        })),
      ];
      const roundComplete = participantIds.every((playerId) => (
        clues.some((clue) => (
          clue.round === room.app.currentRound
          && clue.playerId === playerId
        ))
      ));
      const isLastRound =
        room.app.currentRound >= room.settings.roundsTotal;
      const nextRound = roundComplete && !isLastRound
        ? room.app.currentRound + 1
        : room.app.currentRound;
      const nextOwner = room.settings.clueMode === "turn"
        ? participantIds.find((playerId) => (
            !clues.some((clue) => (
              clue.round === nextRound
              && clue.playerId === playerId
            ))
          )) ?? null
        : null;
      return {
        phase: roundComplete && isLastRound ? "vote" : "clue",
        app: {
          ...room.app,
          clues,
          currentRound: nextRound,
        },
        timer: "reset",
        timerOwnerPlayerId: nextOwner,
        timedOutPlayerIds,
      };
    }
    if (room.phase === "vote") {
      const timedOutPlayerIds = participantIds.filter(
        (playerId) => !room.app.votes[playerId],
      );
      if (timedOutPlayerIds.length === 0) {
        throw new Error("TIMER_TIMEOUT_PLAYERS_INVALID");
      }
      const votes = { ...room.app.votes };
      for (const playerId of timedOutPlayerIds) {
        votes[playerId] = participantIds.find(
          (targetId) => targetId !== playerId,
        ) ?? playerId;
      }
      const tally = tallyGameSdkVotes(votes, participantIds);
      const accusedId = tally.leaderIds[0] ?? null;
      const wolfWasAccused = room.app.wolfIds.includes(accusedId ?? "");
      return {
        phase: wolfWasAccused ? "wolfGuess" : "result",
        app: {
          ...room.app,
          votes,
          accusedId,
          winner: wolfWasAccused ? null : "wolf",
        },
        timer: wolfWasAccused ? "reset" : "stop",
        timerOwnerPlayerId: wolfWasAccused ? accusedId : null,
        timedOutPlayerIds,
        ...(!wolfWasAccused ? {
          standardResult: wordWolfSdkStandardResult(room, "wolf"),
        } : {}),
      };
    }
    if (room.phase === "wolfGuess") {
      const timedOutPlayerId =
        room.app.accusedId ?? room.app.wolfIds[0];
      if (!timedOutPlayerId) {
        throw new Error("TIMER_TIMEOUT_PLAYERS_INVALID");
      }
      return {
        phase: "result",
        app: { ...room.app, winner: "village" },
        timer: "stop",
        timerOwnerPlayerId: null,
        timedOutPlayerIds: [timedOutPlayerId],
        standardResult: wordWolfSdkStandardResult(room, "village"),
      };
    }
    throw new Error("TIMER_EXPIRY_UNSUPPORTED_PHASE");
  },

  async createAppState(input, context) {
    const providedTopic = input.topic?.villageWord.trim()
      && input.topic.wolfWord.trim()
      ? {
          villageWord: input.topic.villageWord.trim(),
          wolfWord: input.topic.wolfWord.trim(),
        }
      : null;
    if (providedTopic) return emptyWordWolfSdkState(providedTopic);
    const [pair] = await requireGameSdkContentSource(
      context.resources,
    ).drawWordPairs({
      pool: "word-pairs",
      count: 1,
      difficulty: "normal",
    });
    if (!pair) throw new Error("GAME_SDK_CONTENT_UNAVAILABLE");
    return emptyWordWolfSdkState({
      villageWord: pair.first.surface,
      wolfWord: pair.second.surface,
    });
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
        timerOwnerPlayerId: room.settings.clueMode === "turn"
          ? room.players[0]?.id ?? null
          : null,
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
        timer: "reset",
        timerOwnerPlayerId: (
          roundComplete && isLastRound
          || room.settings.clueMode === "simultaneous"
        )
          ? null
          : room.players.find((player) => (
              !clues.some((clue) => (
                clue.round === (
                  roundComplete && !isLastRound
                    ? app.currentRound + 1
                    : app.currentRound
                )
                && clue.playerId === player.id
              ))
            ))?.id ?? null,
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
          timer: "reset",
          timerOwnerPlayerId: null,
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
        timer: wolfWasAccused ? "reset" : "stop",
        timerOwnerPlayerId: wolfWasAccused ? accusedId : null,
        ...(!wolfWasAccused ? {
          standardResult: wordWolfSdkStandardResult(room, "wolf"),
        } : {}),
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
        timer: "stop",
        standardResult: wordWolfSdkStandardResult(
          room,
          correct ? "wolf" : "village",
        ),
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
