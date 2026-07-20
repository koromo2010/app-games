import { normalizeGameDebugLog } from "@/lib/game-debug-log";
import {
  areValidNigoichiAssociations,
  correctNigoichiConfig,
  finishNigoichiRound,
  nigoichiPlayerLimit,
  normalizeNigoichiTimeLimit,
  normalizeNigoichiPlayerCapacity,
  type NigoichiHand,
  type NigoichiPhase,
  type NigoichiPlayer,
  type NigoichiRoom,
  type NigoichiRoundLog,
  type NigoichiRoundScoreResult,
  type NigoichiWordDifficulty,
} from "@/lib/nigoichi";
import { normalizeOnlineRoomCode } from "@/lib/online-room-input";
import { normalizeRoomLobbyReturnState } from "@/lib/room-lobby-return";
import { normalizeRoomContentLocale } from "@/lib/game-language";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";

function isPhase(value: unknown): value is NigoichiPhase {
  return value === "lobby" || value === "clue" || value === "guess" || value === "result";
}

export function normalizeWordDifficulty(value: unknown): NigoichiWordDifficulty {
  return value === "easy" || value === "hard" ? value : "normal";
}

function normalizePlayers(value: unknown): NigoichiPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const player = item as Partial<NigoichiPlayer>;
    if (typeof player.id !== "string" || typeof player.name !== "string") return [];
    const id = player.id.trim().slice(0, 120);
    const name = player.name.trim().slice(0, 20);
    if (!id || !name) return [];
    return [{
      id,
      name,
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
      isDummy: player.isDummy === true,
      shareNameAllowed: player.shareNameAllowed === true,
    }];
  }).slice(0, nigoichiPlayerLimit);
}

function normalizeNumberRecord(value: unknown, wordCount: number) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (!key || typeof item !== "number" || !Number.isInteger(item) || item < 0 || item >= wordCount) return [];
    return [[key.slice(0, 120), item]];
  }));
}

function normalizeTotalScores(value: unknown, players: NigoichiPlayer[]) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(players.map((player) => {
    const score = source[player.id];
    return [player.id, typeof score === "number" && Number.isInteger(score) ? score : 0];
  }));
}

function normalizeRoundScore(value: unknown, playerId: string): NigoichiRoundScoreResult | null {
  if (!value || typeof value !== "object") return null;
  const score = value as Partial<NigoichiRoundScoreResult>;
  if (score.playerId !== playerId
    || typeof score.isCorrect !== "boolean"
    || !Number.isInteger(score.correctBonus)
    || !Number.isInteger(score.receivedWrongVotes)
    || !Number.isInteger(score.roundScore)
    || !Number.isInteger(score.totalScoreAfterRound)) return null;
  return {
    playerId,
    isCorrect: score.isCorrect,
    correctBonus: score.correctBonus as number,
    receivedWrongVotes: score.receivedWrongVotes as number,
    roundScore: score.roundScore as number,
    totalScoreAfterRound: score.totalScoreAfterRound as number,
  };
}

function normalizeRoundScores(value: unknown, players: NigoichiPlayer[]) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(players.flatMap((player) => {
    const score = normalizeRoundScore(source[player.id], player.id);
    return score ? [[player.id, score]] : [];
  }));
}

function normalizeRoundHistory(value: unknown): NigoichiRoundLog[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): NigoichiRoundLog[] => {
    if (!item || typeof item !== "object") return [];
    const round = item as Partial<NigoichiRoundLog>;
    if (typeof round.roundId !== "string"
      || !Number.isInteger(round.gameNumber)
      || !Number.isInteger(round.playerCount)
      || !Number.isInteger(round.unassignedCardNumber)
      || !Array.isArray(round.votes)
      || !Array.isArray(round.scores)) return [];
    const votes = round.votes.flatMap((vote) => {
      if (!vote || typeof vote !== "object") return [];
      const parsedVote = vote as { playerId?: unknown; selectedCardNumber?: unknown };
      if (typeof parsedVote.playerId !== "string") return [];
      const selectedCardNumber = parsedVote.selectedCardNumber;
      if (selectedCardNumber !== null && !Number.isInteger(selectedCardNumber)) return [];
      return [{ playerId: parsedVote.playerId.slice(0, 120), selectedCardNumber: selectedCardNumber as number | null }];
    });
    const scores = round.scores.flatMap((score) => {
      if (!score || typeof score !== "object" || typeof (score as { playerId?: unknown }).playerId !== "string") return [];
      const playerId = (score as { playerId: string }).playerId.slice(0, 120);
      const normalized = normalizeRoundScore(score, playerId);
      return normalized ? [normalized] : [];
    });
    if (votes.length !== round.votes.length || scores.length !== round.scores.length) return [];
    return [{
      roundId: round.roundId.slice(0, 160),
      gameNumber: round.gameNumber as number,
      playerCount: round.playerCount as number,
      unassignedCardNumber: round.unassignedCardNumber as number,
      votes,
      scores,
    }];
  });
}

function normalizeHands(value: unknown, playerIds: Set<string>, wordCount: number, cardsPerPlayer: number): Record<string, NigoichiHand> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([playerId, item]) => {
    if (!playerIds.has(playerId) || !Array.isArray(item) || item.length !== cardsPerPlayer) return [];
    if (!item.every((number) => Number.isInteger(number) && (number as number) >= 0 && (number as number) < wordCount)) return [];
    if (new Set(item).size !== item.length) return [];
    return [[playerId, item as number[]]];
  }));
}

export function normalizeAssociationWords(value: unknown, associationWordCount: number) {
  if (!Array.isArray(value)) return null;
  const clues = value.flatMap((item): string[] => {
    const raw = typeof item === "string"
      ? item
      : item && typeof item === "object" && typeof (item as { clue?: unknown }).clue === "string"
        ? (item as { clue: string }).clue
        : "";
    const clue = raw.trim().replace(/\s+/g, " ").slice(0, 30);
    return clue ? [clue] : [];
  });
  return areValidNigoichiAssociations(clues, associationWordCount) ? clues : null;
}

function normalizeAssociations(
  value: unknown,
  legacyClues: unknown,
  hands: Record<string, NigoichiHand>,
  associationWordCount: number,
) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const legacy = legacyClues && typeof legacyClues === "object" ? legacyClues as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(hands).flatMap(([playerId]) => {
    const clues = normalizeAssociationWords(source[playerId], associationWordCount);
    if (clues) return [[playerId, clues]];
    const legacyValue = legacy[playerId];
    const migrated = normalizeAssociationWords(typeof legacyValue === "string" ? [legacyValue] : legacyValue, associationWordCount);
    return migrated
      ? [[playerId, migrated]]
      : [];
  }));
}

export function normalizeNigoichiRoom(value: unknown): NigoichiRoom | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<NigoichiRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const players = normalizePlayers(parsed.players);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  if (!code || !hostId || players.length === 0 || !players.some((player) => player.id === hostId)) return null;
  const playerCapacity = normalizeNigoichiPlayerCapacity(parsed.playerCapacity, players.length);
  const legacy = parsed as Partial<NigoichiRoom> & { clues?: unknown };
  const requestedAssociationWordCount = typeof parsed.associationWordCount === "number" ? parsed.associationWordCount : 1;
  const requestedCardsPerPlayer = typeof parsed.cardsPerPlayer === "number" ? parsed.cardsPerPlayer : 2;
  const config = correctNigoichiConfig(players.length, requestedCardsPerPlayer, requestedAssociationWordCount);
  const wordDifficulty = normalizeWordDifficulty(parsed.wordDifficulty);
  const words = Array.isArray(parsed.words)
    ? parsed.words.filter((word): word is string => typeof word === "string").map((word) => word.trim().slice(0, 80)).filter(Boolean).slice(0, 21)
    : [];
  const playerIds = new Set(players.map((player) => player.id));
  const hands = normalizeHands(parsed.hands, playerIds, words.length, config.cardsPerPlayer);
  const missingNumber = typeof parsed.missingNumber === "number" && Number.isInteger(parsed.missingNumber) && parsed.missingNumber >= 0 && parsed.missingNumber < words.length
    ? parsed.missingNumber
    : null;
  const phase = isPhase(parsed.phase) ? parsed.phase : "lobby";
  const normalizedRoom: NigoichiRoom = {
    code,
    contentLocale: normalizeRoomContentLocale(parsed.contentLocale),
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId.slice(0, 120) : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, 40) : "",
    phase,
    players,
    lobbyReturn: normalizeRoomLobbyReturnState(parsed.lobbyReturn, players),
    playerCapacity,
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : 1,
    gameStartedAt: typeof parsed.gameStartedAt === "number" && Number.isFinite(parsed.gameStartedAt) ? parsed.gameStartedAt : null,
    cardsPerPlayer: config.cardsPerPlayer,
    associationWordCount: config.associationWordCount,
    wordDifficulty,
    clueTimeLimitSeconds: normalizeNigoichiTimeLimit(parsed.clueTimeLimitSeconds),
    guessTimeLimitSeconds: normalizeNigoichiTimeLimit(parsed.guessTimeLimitSeconds),
    phaseStartedAt: (phase === "clue" || phase === "guess") && typeof parsed.phaseStartedAt === "number" && Number.isFinite(parsed.phaseStartedAt) ? parsed.phaseStartedAt : null,
    debugMode: parsed.debugMode === true,
    debugReplayEnabled: parsed.debugReplayEnabled === true && parsed.debugMode === true,
    words,
    hands,
    associations: normalizeAssociations(parsed.associations, legacy.clues, hands, config.associationWordCount),
    guesses: normalizeNumberRecord(parsed.guesses, words.length),
    missingNumber,
    totalScores: normalizeTotalScores(parsed.totalScores, players),
    roundScores: normalizeRoundScores(parsed.roundScores, players),
    roundHistory: normalizeRoundHistory(parsed.roundHistory),
    debugLog: normalizeGameDebugLog(parsed.debugLog),
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
  const needsLegacyScoreMigration = normalizedRoom.phase === "result"
    && normalizedRoom.missingNumber !== null
    && Object.keys(normalizedRoom.roundScores).length !== players.length
    && parsed.totalScores === undefined
    && parsed.roundScores === undefined;
  return needsLegacyScoreMigration ? finishNigoichiRound(normalizedRoom) : normalizedRoom;
}
