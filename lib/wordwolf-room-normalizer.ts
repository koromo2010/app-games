import { normalizeGameGenerationMeta } from "@/lib/game-ai-types";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { normalizeOnlineRoomCode, onlineRoomPassphraseMaximumLength } from "@/lib/online-room-input";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { normalizePlayerTimeoutFields } from "@/lib/player-timeout-policy";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";
import {
  normalizeTopicDictionarySource,
  normalizeTopicPairDistance,
} from "@/lib/wordwolf";
import { normalizeWordDifficulty } from "@/lib/word-selection-protocol";
import type {
  Clue,
  ClueMode,
  GameMode,
  Phase,
  Player,
  Room,
  VoteRound,
} from "@/lib/wordwolf-game-types";
import type { WordWolfGuessJudgement } from "@/lib/wordwolf-guess-judgement";

type WordWolfRoom = Room;

export function normalizeGameMode(value: unknown): GameMode {
  return value === "may-no-wolf" || value === "no-wolf" ? "may-no-wolf" : "wordwolf";
}

export function normalizeClueMode(value: unknown): ClueMode {
  return value === "simultaneous" ? "simultaneous" : "turn";
}

export function isPhase(value: unknown): value is Phase {
  return value === "lobby" || value === "clue" || value === "vote" || value === "wolfGuess" || value === "result";
}

export function normalizeScores(value: unknown) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([playerId, score]) => playerId && typeof score === "number" && Number.isFinite(score))
      .map(([playerId, score]) => [playerId, Math.max(0, Math.floor(score as number))]),
  );
}

export function normalizeVoteHistory(value: unknown): VoteRound[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const parsed = item as Partial<VoteRound>;
      return {
        round: typeof parsed.round === "number" ? Math.max(1, Math.floor(parsed.round)) : index + 1,
        votes: parsed.votes && typeof parsed.votes === "object" ? (parsed.votes as Record<string, string>) : {},
        candidateIds: Array.isArray(parsed.candidateIds)
          ? parsed.candidateIds.filter((candidateId): candidateId is string => typeof candidateId === "string")
          : [],
        at: typeof parsed.at === "number" ? parsed.at : Date.now(),
      };
    })
    .filter((item): item is VoteRound => Boolean(item));
}

export function normalizeRunoffCandidateIds(value: unknown) {
  return Array.isArray(value) ? value.filter((candidateId): candidateId is string => typeof candidateId === "string") : null;
}

export function normalizeWolfIds(room: Partial<WordWolfRoom>) {
  const wolfIds = Array.isArray(room.wolfIds)
    ? room.wolfIds.filter((wolfId): wolfId is string => typeof wolfId === "string")
    : [];
  if (wolfIds.length > 0) return [...new Set(wolfIds)];
  return typeof room.wolfId === "string" ? [room.wolfId] : [];
}

export function maxWolfCount(playerCount: number) {
  return Math.max(1, Math.floor((Math.max(3, playerCount) - 1) / 2));
}

export function normalizeWolfCount(value: unknown, playerCount: number) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(maxWolfCount(playerCount), count));
}

const allowedRoundsTotal = [1, 2, 3, 4];

export function normalizeRoundsTotal(value: unknown) {
  const round = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 3;
  return allowedRoundsTotal.includes(round) ? round : 3;
}

export function normalizeGuessJudgement(value: unknown): WordWolfGuessJudgement | null {
  if (!value || typeof value !== "object") return null;

  const parsed = value as Partial<WordWolfGuessJudgement>;
  const source =
    parsed.source === "exact" || parsed.source === "feedback" || parsed.source === "llm" || parsed.source === "fuzzy"
      ? parsed.source
      : "fuzzy";

  if (typeof parsed.accepted !== "boolean") return null;

  return {
    accepted: parsed.accepted,
    source,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
    confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
    feedbackAccepted: typeof parsed.feedbackAccepted === "number" ? Math.max(0, Math.floor(parsed.feedbackAccepted)) : 0,
    feedbackRejected: typeof parsed.feedbackRejected === "number" ? Math.max(0, Math.floor(parsed.feedbackRejected)) : 0,
  };
}

export function didPlayerWin(room: WordWolfRoom, playerId: string) {
  if (room.winner === "players") {
    return room.accusedId ? playerId !== room.accusedId : true;
  }

  if (room.winner === "village") {
    return !normalizeWolfIds(room).includes(playerId);
  }

  return normalizeWolfIds(room).includes(playerId);
}

export function addRoomScore(room: WordWolfRoom) {
  if (room.phase !== "result" || !room.winner) return room;

  const scores = { ...room.scores };
  for (const player of room.players) {
    if (didPlayerWin(room, player.id)) {
      scores[player.id] = (scores[player.id] ?? 0) + 1;
    }
  }

  return {
    ...room,
    scores,
    gamesPlayed: room.gamesPlayed + 1,
  };
}

export function normalizeWordWolfRoom(value: unknown): WordWolfRoom | null {
  if (!value || typeof value !== "object") return null;

  const parsed = value as Partial<WordWolfRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  const players = Array.isArray(parsed.players) ? parsed.players.filter((player) => player?.id && player?.name) : [];
  const gamesPlayed = typeof parsed.gamesPlayed === "number" ? Math.max(0, Math.floor(parsed.gamesPlayed)) : 0;

  if (!code || !hostId || players.length === 0) return null;

  const normalizedPlayers = players.slice(0, onlineRoomPlayerLimits.wordwolf).map((player) => ({
    ...player,
    id: String(player.id).slice(0, 80),
    name: String(player.name).trim().slice(0, 40),
    avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
    avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
  })) as Player[];

  return {
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    code,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, onlineRoomPassphraseMaximumLength) : "",
    phase: isPhase(parsed.phase) ? parsed.phase : "lobby",
    gameMode: normalizeGameMode(parsed.gameMode),
    debugMode: Boolean(parsed.debugMode),
    debugReplayEnabled: Boolean(parsed.debugMode && parsed.debugReplayEnabled),
    clueLogVisibility: parsed.clueLogVisibility === "always" ? "always" : "result",
    clueMode: normalizeClueMode(parsed.clueMode),
    randomizeTurnOrder: parsed.randomizeTurnOrder ?? true,
    players: normalizedPlayers,
    ...normalizePlayerTimeoutFields(parsed, normalizedPlayers.map((player) => player.id)),
    roundsTotal: normalizeRoundsTotal(parsed.roundsTotal),
    turnTimeLimitSeconds: normalizeCommonTimeLimit(parsed.turnTimeLimitSeconds),
    currentRound: typeof parsed.currentRound === "number" ? parsed.currentRound : 1,
    currentTurnIndex: typeof parsed.currentTurnIndex === "number" ? parsed.currentTurnIndex : 0,
    currentTurnStartedAt: typeof parsed.currentTurnStartedAt === "number" ? parsed.currentTurnStartedAt : null,
    wolfId: typeof parsed.wolfId === "string" ? parsed.wolfId : null,
    wolfIds: normalizeWolfIds(parsed),
    wolfCount: normalizeWolfCount(parsed.wolfCount, players.length),
    villageWord: typeof parsed.villageWord === "string" ? parsed.villageWord : "",
    wolfWord: typeof parsed.wolfWord === "string" ? parsed.wolfWord : "",
    topicReason: typeof parsed.topicReason === "string" ? parsed.topicReason : "",
    topicSource: parsed.topicSource === "llm" || parsed.topicSource === "fallback" ? parsed.topicSource : "pending",
    topicFallbackExhausted: Boolean(parsed.topicFallbackExhausted),
    topicGeneration: normalizeGameGenerationMeta(parsed.topicGeneration),
    topicDictionarySource: normalizeTopicDictionarySource(parsed.topicDictionarySource ?? parsed.topicSourceMode),
    topicPairDistance: normalizeTopicPairDistance(parsed.topicPairDistance ?? parsed.topicSourceMode),
    topicDifficulty: normalizeWordDifficulty(parsed.topicDifficulty),
    topicHint: typeof parsed.topicHint === "string" ? parsed.topicHint.slice(0, 80) : "",
    topicAnchorWordId: typeof parsed.topicAnchorWordId === "string" ? parsed.topicAnchorWordId : undefined,
    topicPartnerWordId: typeof parsed.topicPartnerWordId === "string" ? parsed.topicPartnerWordId : undefined,
    topicAnchorWord: typeof parsed.topicAnchorWord === "string" ? parsed.topicAnchorWord : undefined,
    clues: Array.isArray(parsed.clues) ? (parsed.clues as Clue[]) : [],
    votes: parsed.votes && typeof parsed.votes === "object" ? (parsed.votes as Record<string, string>) : {},
    voteHistory: normalizeVoteHistory(parsed.voteHistory),
    runoffCandidateIds: normalizeRunoffCandidateIds(parsed.runoffCandidateIds),
    accusedId: typeof parsed.accusedId === "string" ? parsed.accusedId : null,
    wolfGuess: typeof parsed.wolfGuess === "string" ? parsed.wolfGuess : "",
    wolfGuessJudgement: normalizeGuessJudgement(parsed.wolfGuessJudgement),
    winner: parsed.winner === "village" || parsed.winner === "wolf" || parsed.winner === "players" ? parsed.winner : null,
    resultText: typeof parsed.resultText === "string" ? parsed.resultText : "",
    scores: normalizeScores(parsed.scores),
    gamesPlayed,
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : gamesPlayed + 1,
    statsRecordedAt: typeof parsed.statsRecordedAt === "number" ? parsed.statsRecordedAt : undefined,
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}
