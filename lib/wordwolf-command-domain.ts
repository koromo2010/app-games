import type { Room } from "@/lib/wordwolf-game-types";
import type { WordWolfTopic } from "@/lib/wordwolf";
import { randomUUID } from "node:crypto";
import { getGameTimerDeadlineAt, isGameTimerExpired, timerHyperparameter, type GameTimerPolicy } from "@/lib/game-timer/policy";
import { playerTimeLimitSeconds, recordPlayerActivity, recordPlayerTimeout, reducedPlayerTimeLimitSeconds } from "@/lib/player-timeout-policy";

const abstainVoteId = "__abstain__";
const timeoutText = "時間切れ";
export function wordWolfTimeoutGraceMs() {
  return timerHyperparameter("WORDWOLF_TIMEOUT_GRACE_MS", 5000, 0, 10000);
}
const wolfIds = (room: Room) => room.wolfIds.length ? room.wolfIds : room.wolfId ? [room.wolfId] : [];
const runoffCandidates = (room: Room) => room.runoffCandidateIds?.length ? room.players.filter((player) => room.runoffCandidateIds?.includes(player.id)) : room.players;
const cluePlayers = (room: Room) => room.runoffCandidateIds?.length ? runoffCandidates(room) : room.players;
const voteVoters = (room: Room) => !room.runoffCandidateIds?.length || room.runoffCandidateIds.length >= 3
  ? room.players
  : room.players.filter((player) => !room.runoffCandidateIds?.includes(player.id));

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function maximumWolfCount(playerCount: number) {
  return Math.max(1, Math.floor((Math.max(3, playerCount) - 1) / 2));
}

export function applyWordWolfStartCommand(room: Room, actorId: string, topic: WordWolfTopic, now = Date.now()) {
  if (room.phase !== "lobby" || room.hostId !== actorId) return null;
  const players = [...room.players];
  while (room.debugMode && players.length < 3) {
    const number = players.length + 1;
    players.push({ id: `dummy-${randomUUID()}`, name: `Test Player ${number}`, joinedAt: now + number });
  }
  if (!room.debugMode && players.length < 3) return null;
  const orderedPlayers = room.randomizeTurnOrder ? shuffled(players) : players;
  const shouldHaveWolf = room.gameMode === "wordwolf" || Math.random() >= 0.1;
  const wolfCount = shouldHaveWolf ? Math.max(1, Math.min(maximumWolfCount(orderedPlayers.length), room.wolfCount)) : 0;
  const selectedWolves = shouldHaveWolf ? shuffled(orderedPlayers).slice(0, wolfCount) : [];
  const selectedWolfIds = selectedWolves.map((player) => player.id);
  return {
    ...room,
    players: orderedPlayers,
    phase: "clue" as const,
    currentRound: 1,
    currentTurnIndex: 0,
    currentTurnStartedAt: now,
    wolfId: selectedWolfIds[0] ?? null,
    wolfIds: selectedWolfIds,
    wolfCount: Math.max(1, wolfCount),
    villageWord: topic.villageWord,
    wolfWord: selectedWolfIds.length ? topic.wolfWord : topic.villageWord,
    topicReason: topic.reason,
    topicSource: topic.source,
    topicFallbackExhausted: Boolean(topic.fallbackExhausted),
    topicGeneration: topic.generation,
    clues: [],
    votes: {},
    voteHistory: [],
    runoffCandidateIds: null,
    accusedId: null,
    wolfGuess: "",
    wolfGuessJudgement: null,
    winner: null,
    resultText: "",
  };
}

export function wordWolfTimerPolicy(room: Room): GameTimerPolicy {
  const multiplier = room.phase === "vote" || room.phase === "wolfGuess" ? 2 : room.phase === "clue" ? 1 : 0;
  return { startedAt: room.currentTurnStartedAt, durationMs: room.turnTimeLimitSeconds * multiplier * 1000, graceMs: wordWolfTimeoutGraceMs() };
}

export function wordWolfDeadlineAt(room: Room) {
  return getGameTimerDeadlineAt(wordWolfTimerPolicy(room));
}

function timeoutClue(room: Room, now: number, onlyIds?: string[]): Room {
  const participants = cluePlayers(room);
  const missing = (room.clueMode === "simultaneous"
    ? participants.filter((player) => !room.clues.some((clue) => clue.round === room.currentRound && clue.playerId === player.id))
    : [room.players[room.currentTurnIndex]].filter(Boolean)).filter((player) => !onlyIds || onlyIds.includes(player.id));
  if (!missing.length) return room;
  let changed = room;
  for (const player of missing) changed = recordPlayerTimeout(changed, player.id, player.name, now);
  const clues = [...room.clues, ...missing.map((player) => ({ playerId: player.id, round: room.currentRound, text: timeoutText, at: now }))];
  const complete = participants.every((player) => clues.some((clue) => clue.round === room.currentRound && clue.playerId === player.id));
  if (!complete) {
    if (room.clueMode === "simultaneous") return { ...changed, clues };
    const currentIndex = participants.findIndex((player) => player.id === room.players[room.currentTurnIndex]?.id);
    const next = participants[(currentIndex + 1) % participants.length];
    return { ...changed, clues, currentTurnIndex: Math.max(0, room.players.findIndex((player) => player.id === next?.id)), currentTurnStartedAt: now };
  }
  const runoff = Boolean(room.runoffCandidateIds?.length); const lastRound = room.currentRound >= room.roundsTotal;
  return { ...changed, clues, currentTurnIndex: 0, currentRound: !runoff && !lastRound ? room.currentRound + 1 : room.currentRound, phase: runoff || lastRound ? "vote" : "clue", currentTurnStartedAt: now };
}

function timeoutVote(room: Room, now: number): Room {
  let changed = room;
  const votes = { ...room.votes }; for (const player of voteVoters(room)) if (!votes[player.id]) { votes[player.id] = abstainVoteId; changed = recordPlayerTimeout(changed, player.id, player.name, now); }
  const candidates = runoffCandidates(room);
  const counts = candidates.map((player) => ({ id: player.id, count: Object.values(votes).filter((id) => id === player.id).length }));
  const max = Math.max(0, ...counts.map((item) => item.count));
  const top = max ? counts.filter((item) => item.count === max).map((item) => item.id) : [];
  const voteHistory = [...room.voteHistory, { round: room.voteHistory.length + 1, votes, candidateIds: candidates.map((player) => player.id), at: now }];
  if (top.length > 1) {
    const extraRound = room.currentRound + 1;
    const hasRunoffVoters = top.length >= 3 || room.players.some((player) => !top.includes(player.id));
    return { ...changed, phase: "clue", votes: {}, voteHistory, runoffCandidateIds: hasRunoffVoters ? top : null, currentRound: extraRound, currentTurnIndex: 0, currentTurnStartedAt: now };
  }
  const accusedId = top[0] ?? null;
  if (room.gameMode === "may-no-wolf" && wolfIds(room).length === 0) {
    const loser = room.players.find((player) => player.id === accusedId)?.name ?? "プレイヤー";
    return { ...changed, phase: "result", votes, voteHistory, runoffCandidateIds: null, accusedId, currentTurnStartedAt: null, winner: "players", resultText: accusedId ? `狼はいませんでした。投票で選ばれた${loser}の負けです。` : "狼はいませんでした。投票が割れたため決着はつきません。" };
  }
  if (accusedId && wolfIds(room).includes(accusedId)) return { ...changed, phase: "wolfGuess", votes, voteHistory, runoffCandidateIds: null, accusedId, currentTurnStartedAt: now };
  return { ...changed, phase: "result", votes, voteHistory, runoffCandidateIds: null, accusedId, currentTurnStartedAt: null, winner: "wolf", resultText: accusedId ? "投票で狼を当てられませんでした。狼の勝利です。" : "投票が割れました。狼の勝利です。" };
}

export function applyWordWolfClueCommand(room: Room, playerId: string, rawText: string, now = Date.now()) {
  if (room.phase !== "clue") return null;
  const text = rawText.trim().slice(0, 500);
  if (!text) return null;
  const participants = cluePlayers(room);
  const actor = participants.find((player) => player.id === playerId);
  if (!actor || room.clues.some((clue) => clue.round === room.currentRound && clue.playerId === playerId)) return null;
  if (room.clueMode === "turn" && room.players[room.currentTurnIndex]?.id !== playerId) return null;
  room = recordPlayerActivity(room, playerId);
  const clues = [...room.clues, { playerId, round: room.currentRound, text, at: now }];
  const complete = participants.every((player) => clues.some((clue) => clue.round === room.currentRound && clue.playerId === player.id));
  if (!complete) {
    if (room.clueMode === "simultaneous") return { ...room, clues };
    const index = participants.findIndex((player) => player.id === playerId);
    const next = participants[(index + 1) % participants.length];
    return { ...room, clues, currentTurnIndex: Math.max(0, room.players.findIndex((player) => player.id === next?.id)), currentTurnStartedAt: now };
  }
  const runoff = Boolean(room.runoffCandidateIds?.length); const lastRound = room.currentRound >= room.roundsTotal;
  return { ...room, clues, currentTurnIndex: 0, currentRound: !runoff && !lastRound ? room.currentRound + 1 : room.currentRound, phase: runoff || lastRound ? "vote" as const : "clue" as const, currentTurnStartedAt: now };
}

export function applyWordWolfVoteCommand(room: Room, playerId: string, targetId: string, now = Date.now()) {
  if (room.phase !== "vote" || room.votes[playerId]) return null;
  if (!voteVoters(room).some((player) => player.id === playerId) || !runoffCandidates(room).some((player) => player.id === targetId)) return null;
  const withVote = recordPlayerActivity({ ...room, votes: { ...room.votes, [playerId]: targetId } }, playerId);
  if (!voteVoters(withVote).every((player) => withVote.votes[player.id])) return withVote;
  return timeoutVote(withVote, now);
}

export function applyWordWolfTimeout(room: Room, now = Date.now()) {
  if (room.phase === "clue" && room.clueMode === "simultaneous" && room.currentTurnStartedAt) {
    const reducedMissing = cluePlayers(room).filter((player) => room.playerTimeouts[player.id]?.reducedTime && !room.clues.some((clue) => clue.round === room.currentRound && clue.playerId === player.id));
    if (reducedMissing.length > 0 && now >= room.currentTurnStartedAt + reducedPlayerTimeLimitSeconds * 1000 + wordWolfTimeoutGraceMs()) {
      return timeoutClue(room, now, reducedMissing.map((player) => player.id));
    }
  }
  if (room.phase === "vote" && room.currentTurnStartedAt) {
    const reducedMissing = voteVoters(room).filter((player) => room.playerTimeouts[player.id]?.reducedTime && !room.votes[player.id]);
    if (reducedMissing.length > 0 && now >= room.currentTurnStartedAt + reducedPlayerTimeLimitSeconds * 1000 + wordWolfTimeoutGraceMs()) {
      let changed = room;
      const votes = { ...room.votes };
      for (const player of reducedMissing) { votes[player.id] = abstainVoteId; changed = recordPlayerTimeout(changed, player.id, player.name, now); }
      changed = { ...changed, votes };
      return voteVoters(changed).every((player) => changed.votes[player.id]) ? timeoutVote(changed, now) : changed;
    }
  }
  const personalId = room.phase === "clue" && room.clueMode === "turn" ? room.players[room.currentTurnIndex]?.id : room.phase === "wolfGuess" ? room.accusedId ?? undefined : undefined;
  const policy = personalId && room.playerTimeouts[personalId]?.reducedTime
    ? { ...wordWolfTimerPolicy(room), durationMs: playerTimeLimitSeconds(room.turnTimeLimitSeconds, room.playerTimeouts, personalId) * 1000 }
    : wordWolfTimerPolicy(room);
  if (!isGameTimerExpired(policy, now)) return null;
  if (room.phase === "clue") return timeoutClue(room, now);
  if (room.phase === "vote") return timeoutVote(room, now);
  if (room.phase === "wolfGuess") {
    const player = room.players.find((item) => item.id === room.accusedId);
    const changed = player ? recordPlayerTimeout(room, player.id, player.name, now) : room;
    return { ...changed, phase: "result" as const, currentTurnStartedAt: null, wolfGuess: timeoutText, winner: "village" as const, resultText: "逆転回答は時間切れです。村側の勝利です。" };
  }
  return null;
}
