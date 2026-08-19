import { defineGameSdkOnlineRoomAppSet } from "@game-fields/game-sdk/runtime";
import {
  assertGameSdkCanStart,
  assertGameSdkPhase,
  allGameSdkParticipantsComplete,
  defineGameSdkStandardResult,
  gameSdkPlayerSeat,
  gameSdkPlayerSeats,
  recordGameSdkParticipantValue,
} from "@game-fields/game-sdk/modules";
import type {
  JankenAppCommand,
  JankenAppInput,
  JankenAppState,
  JankenAppView,
  JankenChoice,
  JankenOutcome,
  JankenSettings,
} from "./contracts.js";
import { jankenManifest } from "./manifest.js";

const choices: readonly JankenChoice[] = ["rock", "paper", "scissors"];

const moduleRuntimeEvidence = (marker: string) => marker;

function isChoice(value: unknown): value is JankenChoice {
  return typeof value === "string" && choices.includes(value as JankenChoice);
}

function decide(
  firstPlayerId: string,
  first: JankenChoice,
  secondPlayerId: string,
  second: JankenChoice,
): JankenOutcome {
  if (first === second) return { winnerPlayerId: null, draw: true };
  const firstWins = (
    (first === "rock" && second === "scissors")
    || (first === "scissors" && second === "paper")
    || (first === "paper" && second === "rock")
  );
  return {
    winnerPlayerId: firstWins ? firstPlayerId : secondPlayerId,
    draw: false,
  };
}

function defineOutcome(
  playerIds: readonly string[],
  outcome: JankenOutcome,
  reason: "choices-revealed" | "choice-timeout",
) {
  return defineGameSdkStandardResult({
    winnerIds: outcome.winnerPlayerId ? [outcome.winnerPlayerId] : [],
    rankings: playerIds.map((participantId) => ({
      participantId,
      rank: outcome.draw ? 1 : participantId === outcome.winnerPlayerId ? 1 : 2,
      score: outcome.draw ? 0 : participantId === outcome.winnerPlayerId ? 1 : 0,
    })),
    reason,
    presentation: {
      reason: outcome.draw
        ? { ja: "同じ手のため引き分け", en: "Both players chose the same hand" }
        : { ja: "じゃんけんの勝敗が確定", en: "The rock-paper-scissors result is final" },
    },
  }, { participantIds: playerIds });
}

function emptyState(): JankenAppState {
  return { choices: {}, revealed: false, outcome: null };
}

export const jankenAppSet = defineGameSdkOnlineRoomAppSet<
  JankenSettings,
  JankenAppState,
  JankenAppInput,
  JankenAppCommand,
  JankenAppView
>({
  manifest: jankenManifest,
  defaultSettings: { timeLimitSeconds: 60 },
  normalizeSettings(settings) {
    return {
      timeLimitSeconds: Number.isSafeInteger(settings.timeLimitSeconds)
        ? Math.min(3600, Math.max(0, settings.timeLimitSeconds))
        : 60,
    };
  },
  timer: {
    durationSeconds(settings) {
      return settings.timeLimitSeconds;
    },
  },
  expireAppTurn(room) {
    const playerIds = room.players.map((player) => player.id);
    const submittedId = playerIds.find((playerId) => room.app.choices[playerId]);
    const outcome: JankenOutcome = submittedId
      ? { winnerPlayerId: submittedId, draw: false }
      : { winnerPlayerId: null, draw: true };
    return {
      phase: "result",
      app: { ...room.app, revealed: true, outcome },
      timer: "stop",
      timedOutPlayerIds: playerIds.filter((playerId) => !room.app.choices[playerId]),
      standardResult: defineOutcome(playerIds, outcome, "choice-timeout"),
    };
  },
  createAppState() {
    return emptyState();
  },
  resetAppState() {
    return emptyState();
  },
  applyAppCommand(room, command, context) {
    if (command.type === "game/start") {
      assertGameSdkCanStart({
        actorId: context.actor.playerId,
        hostId: room.hostPlayerId,
        phase: room.phase,
        participantCount: room.players.length,
        minimumPlayers: jankenManifest.minimumPlayers,
        errors: { phase: "INVALID_PHASE" },
      });
      return {
        phase: "playing",
        app: emptyState(),
        timerOwnerPlayerId: room.hostPlayerId,
      };
    }
    assertGameSdkPhase(room.phase, "playing", "INVALID_PHASE");
    if (!isChoice(command.choice)) throw new Error("CHOICE_INVALID");
    const playerIds = room.players.map((player) => player.id);
    const nextChoices = recordGameSdkParticipantValue(
      room.app.choices,
      context.actor.playerId,
      command.choice,
      {
        participantIds: playerIds,
        errors: {
          participant: "PARTICIPANT_REQUIRED",
          alreadySubmitted: "CHOICE_ALREADY_SUBMITTED",
        },
      },
    );
    const complete = allGameSdkParticipantsComplete(
      playerIds,
      (playerId) => Boolean(nextChoices[playerId]),
    );
    if (!complete) {
      const nextPlayerId = playerIds.find((playerId) => !nextChoices[playerId]);
      return {
        phase: "playing",
        app: { choices: nextChoices, revealed: false, outcome: null },
        timer: "reset",
        ...(nextPlayerId ? { timerOwnerPlayerId: nextPlayerId } : {}),
      };
    }
    const [firstId, secondId] = playerIds;
    if (!firstId || !secondId) throw new Error("TWO_PLAYERS_REQUIRED");
    const outcome = decide(
      firstId,
      nextChoices[firstId]!,
      secondId,
      nextChoices[secondId]!,
    );
    return {
      phase: "result",
      app: { choices: nextChoices, revealed: true, outcome },
      timer: "stop",
      standardResult: defineOutcome(playerIds, outcome, "choices-revealed"),
    };
  },
  presentApp(room, context) {
    const viewerId = context.viewer.playerId;
    const ownChoice = viewerId ? room.app.choices[viewerId] ?? null : null;
    const runtimeMarkers = [
      ...(room.phase !== "lobby"
        ? [moduleRuntimeEvidence("t114-start-guard")]
        : []),
      ...(room.phase === "playing" || room.phase === "result"
        ? [moduleRuntimeEvidence("t114-phase-flow")]
        : []),
      ...(Object.keys(room.app.choices).length > 0
        ? [moduleRuntimeEvidence("t114-collect-choice")]
        : []),
      moduleRuntimeEvidence("t114-secret-presentation"),
      ...(room.app.outcome
        ? [moduleRuntimeEvidence("t114-standard-outcome")]
        : []),
    ];
    return {
      view: {
        ownChoice,
        choices: room.players.map((player) => ({
          seat: gameSdkPlayerSeat(room.players, player.id),
          submitted: Boolean(room.app.choices[player.id]),
          choice: room.app.revealed ? room.app.choices[player.id] ?? null : null,
        })),
        submittedSeats: room.players
          .filter((player) => room.app.choices[player.id])
          .map((player) => player.id)
          .map((playerId) => gameSdkPlayerSeat(room.players, playerId)),
        visiblePlayerSeats: gameSdkPlayerSeats(
          room.players,
          room.players.map((player) => player.id),
        ),
        runtimeMarkers,
        revealed: room.app.revealed,
        outcome: !room.app.revealed || !room.app.outcome || !viewerId
          ? null
          : room.app.outcome.draw
            ? "draw"
            : room.app.outcome.winnerPlayerId === viewerId ? "win" : "lose",
        canChoose: (
          room.phase === "playing"
          && Boolean(viewerId)
          && room.players.some((player) => player.id === viewerId)
          && !room.app.choices[viewerId!]
        ),
      },
    };
  },
});
