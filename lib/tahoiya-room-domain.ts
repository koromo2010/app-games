import { randomUUID } from "node:crypto";
import { commonGameTimeoutGraceMs } from "./game-timer/policy.ts";
import { playerTimeLimitSeconds, recordPlayerTimeout } from "./player-timeout-policy.ts";
import { calculateTahoiyaRoundScores } from "./tahoiya-scoring.ts";
import type { TahoiyaDefinitionOption, TahoiyaRoom } from "./tahoiya-types.ts";

export const tahoiyaTimeoutSubmission = "__timeout__";

export function definitionWriterIds(room: TahoiyaRoom) {
  return room.playMode === "all-vote"
    ? room.players.map((player) => player.id)
    : room.players.filter((player) => player.id !== room.answererId).map((player) => player.id);
}

export function voterIds(room: TahoiyaRoom) {
  return room.playMode === "all-vote"
    ? room.players.map((player) => player.id)
    : room.answererId ? [room.answererId] : [];
}

export function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createDefinitionOptions(room: TahoiyaRoom): TahoiyaDefinitionOption[] {
  return shuffle([
    { id: `real-${randomUUID()}`, text: room.realDefinition, authorId: null, isReal: true },
    ...Object.entries(room.fakeDefinitions).filter(([, text]) => text !== tahoiyaTimeoutSubmission).map(([playerId, text]) => ({
      id: `fake-${randomUUID()}`,
      text,
      authorId: playerId,
      isReal: false,
    })),
  ]);
}

export function scoreRoom(room: TahoiyaRoom) {
  const scores = { ...room.scores };
  const roundScores = calculateTahoiyaRoundScores(room);
  const scoreLines: string[] = [];
  const voteCounts = Object.values(room.votes).reduce<Record<string, number>>((counts, optionId) => {
    counts[optionId] = (counts[optionId] ?? 0) + 1;
    return counts;
  }, {});
  const maxVotes = Math.max(0, ...Object.values(voteCounts));
  const leaders = room.options.filter((option) => maxVotes > 0 && (voteCounts[option.id] ?? 0) === maxVotes);
  const leaderNames = leaders.map((option) => option.isReal
    ? "本物の説明"
    : `${room.players.find((player) => player.id === option.authorId)?.name ?? "Unknown"}の偽説明`);
  const leadResult = leaderNames.length > 0
    ? `最多得票: ${leaderNames.join("・")}（${maxVotes}票）${leaderNames.length > 1 ? " 同率" : ""}`
    : "投票はありませんでした。";

  for (const [voterId, optionId] of Object.entries(room.votes)) {
    const option = room.options.find((item) => item.id === optionId);
    const voter = room.players.find((player) => player.id === voterId);
    if (!option || !voter) continue;
    if (option.isReal) {
      scoreLines.push(`${voter.name} が本物を当てて +${room.correctVotePoints}`);
    } else if (option.authorId) {
      const author = room.players.find((player) => player.id === option.authorId);
      scoreLines.push(`${author?.name ?? "Unknown"} の偽説明に票が入り +${room.fooledVotePoints}`);
    }
  }
  for (const player of room.players) scores[player.id] = (scores[player.id] ?? 0) + (roundScores[player.id] ?? 0);

  return {
    ...room,
    phase: "result" as const,
    phaseStartedAt: null,
    scores,
    resultText: `${leadResult} / ${scoreLines.length > 0 ? scoreLines.join(" / ") : "得点は入りませんでした。"}`,
  };
}

export function writingComplete(room: TahoiyaRoom) {
  const writers = definitionWriterIds(room);
  return writers.length > 0 && writers.every((playerId) => Boolean(room.fakeDefinitions[playerId]));
}

export function votingComplete(room: TahoiyaRoom) {
  const voters = voterIds(room);
  return voters.length > 0 && voters.every((playerId) => Boolean(room.votes[playerId]));
}

export function timedOut(room: TahoiyaRoom, seconds = room.actionTimeLimitSeconds, now = Date.now()) {
  return Boolean(
    room.phaseStartedAt &&
    seconds > 0 &&
    now >= room.phaseStartedAt + seconds * 1000 + commonGameTimeoutGraceMs()
  );
}

export function advanceToVoting(room: TahoiyaRoom) {
  return {
    ...room,
    phase: "voting" as const,
    options: createDefinitionOptions(room),
    votes: {},
    phaseStartedAt: Date.now(),
  };
}

export function reconcileProgress(room: TahoiyaRoom) {
  if (room.phase === "writing") {
    let next = room;
    for (const playerId of definitionWriterIds(room).filter((id) => !room.fakeDefinitions[id])) {
      if (timedOut(room, playerTimeLimitSeconds(room.actionTimeLimitSeconds, room.playerTimeouts, playerId))) {
        const player = room.players.find((item) => item.id === playerId);
        next = recordPlayerTimeout(next, playerId, player?.name ?? "プレイヤー");
        next = { ...next, fakeDefinitions: { ...next.fakeDefinitions, [playerId]: tahoiyaTimeoutSubmission } };
      }
    }
    if (writingComplete(next) || timedOut(room)) return advanceToVoting(next);
    return next;
  }
  if (room.phase === "voting") {
    let next = room;
    for (const playerId of voterIds(room).filter((id) => !room.votes[id])) {
      if (timedOut(room, playerTimeLimitSeconds(room.actionTimeLimitSeconds, room.playerTimeouts, playerId))) {
        const player = room.players.find((item) => item.id === playerId);
        next = recordPlayerTimeout(next, playerId, player?.name ?? "プレイヤー");
        next = { ...next, votes: { ...next.votes, [playerId]: tahoiyaTimeoutSubmission } };
      }
    }
    if (votingComplete(next) || timedOut(room)) return scoreRoom(next);
    return next;
  }
  return room;
}

