import { commonGameTimeoutGraceMs } from "./game-timer/policy.ts";
import { playerTimeLimitSeconds, recordPlayerTimeout } from "./player-timeout-policy.ts";
import {
  countHodoaiInversions,
  dealHodoaiCards,
  hodoaiThemes,
  pickHodoaiTheme,
  pickRandomHodoaiSorter,
  pointsForInversions,
  shuffleHodoai,
  type HodoaiClueRound,
  type HodoaiRoom,
  type HodoaiRoundResult,
} from "./hodoai-talk.ts";
import {
  allGameSdkParticipantsComplete,
  nextGameSdkRoundStep,
} from "@game-fields/game-sdk/modules";

export function clueComplete(room: HodoaiRoom) {
  return allGameSdkParticipantsComplete(
    room.cards.map((card) => card.id),
    (cardId) => Boolean(room.clues[cardId]),
  );
}

export function timedOut(room: HodoaiRoom, seconds: number, now = Date.now()) {
  return Boolean(room.phaseStartedAt && seconds > 0 && now >= room.phaseStartedAt + seconds * 1000 + commonGameTimeoutGraceMs());
}

export function completeClueRound(room: HodoaiRoom) {
  const clues = { ...room.clues };
  for (const card of room.cards) clues[card.id] ||= "時間切れのためパス";
  const clueRound: HodoaiClueRound = { round: room.round, theme: room.theme ?? hodoaiThemes[0], clues };
  const clueHistory = [...room.clueHistory.filter((item) => item.round !== room.round), clueRound].sort((left, right) => left.round - right.round);
  const step = nextGameSdkRoundStep({
    currentRound: room.round,
    totalRounds: room.roundsTotal,
    repeatPhase: "clue" as const,
    completedPhase: "arrange" as const,
  });
  if (!step.complete) {
    return {
      ...room,
      phase: "clue" as const,
      round: step.round,
      theme: pickHodoaiTheme(clueHistory),
      clues: {},
      clueHistory,
      phaseStartedAt: Date.now(),
    };
  }
  return {
    ...room,
    phase: "arrange" as const,
    clues,
    clueHistory,
    order: shuffleHodoai(room.cards.map((card) => card.id)),
    phaseStartedAt: Date.now(),
  };
}

export function scoreRound(room: HodoaiRoom) {
  const inversions = countHodoaiInversions(room.order, room.values);
  const points = pointsForInversions(inversions, room);
  const result: HodoaiRoundResult = {
    round: room.round,
    theme: room.theme ?? hodoaiThemes[0],
    inversions,
    points,
    cards: [...room.cards],
    clueRounds: [...room.clueHistory],
    order: [...room.order],
    values: { ...room.values },
    clues: { ...room.clues },
  };
  return {
    ...room,
    phase: "result" as const,
    totalPoints: points,
    history: [result],
    phaseStartedAt: null,
  };
}

export function beginGame(room: HodoaiRoom) {
  const now = Date.now();
  const dealt = dealHodoaiCards(room.players, room.cardsPerPlayer);
  return {
    ...room,
    gameStartedAt: now,
    sorterId: pickRandomHodoaiSorter(room.players),
    phase: "clue" as const,
    round: 1,
    theme: pickHodoaiTheme([]),
    cards: dealt.cards,
    values: dealt.values,
    clues: {},
    clueHistory: [],
    order: [],
    phaseStartedAt: now,
  };
}

export function reconcileProgress(room: HodoaiRoom) {
  if (room.phase === "clue") {
    let next = room;
    for (const player of room.players) {
      const missing = room.cards.filter((card) => card.ownerId === player.id && !next.clues[card.id]);
      if (missing.length > 0 && timedOut(room, playerTimeLimitSeconds(room.clueTimeLimitSeconds, room.playerTimeouts, player.id))) {
        next = recordPlayerTimeout(next, player.id, player.name);
        next = { ...next, clues: { ...next.clues, ...Object.fromEntries(missing.map((card) => [card.id, "時間切れのためパス"])) } };
      }
    }
    if (clueComplete(next) || timedOut(room, room.clueTimeLimitSeconds)) return completeClueRound(next);
    return next;
  }
  if (room.phase === "arrange") {
    const seconds = playerTimeLimitSeconds(room.arrangeTimeLimitSeconds, room.playerTimeouts, room.sorterId);
    if (timedOut(room, seconds)) {
      const sorter = room.players.find((player) => player.id === room.sorterId);
      return scoreRound(sorter ? recordPlayerTimeout(room, sorter.id, sorter.name) : room);
    }
  }
  return room;
}
