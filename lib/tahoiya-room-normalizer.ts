import { normalizeGameGenerationMeta } from "./game-ai-types.ts";
import { normalizeCommonTimeLimit } from "./game-room-config.ts";
import { normalizeOnlineRoomCode, onlineRoomPassphraseMaximumLength } from "./online-room-input.ts";
import { onlineRoomPlayerLimits } from "./online-room-policy.ts";
import { normalizePlayerTimeoutFields } from "./player-timeout-policy.ts";
import { isAvatarColor, isAvatarImage } from "./player-session.ts";
import { normalizeRoomLobbyReturnState } from "./room-lobby-return.ts";
import { TAHOIYA_CORRECT_VOTE_POINTS, TAHOIYA_FOOLED_VOTE_POINTS } from "./tahoiya-scoring.ts";
import { normalizeTahoiyaTopicGenerationProgress } from "./tahoiya-topic-generation-progress.ts";
import type { TahoiyaAnswererMode, TahoiyaDefinitionOption, TahoiyaPhase, TahoiyaPlayer, TahoiyaRoom } from "./tahoiya-types.ts";

function isPhase(value: unknown): value is TahoiyaPhase {
  return value === "lobby" || value === "writing" || value === "voting" || value === "result";
}

function isAnswererMode(value: unknown): value is TahoiyaAnswererMode {
  return value === "manual" || value === "random";
}

function normalizeScores(value: unknown) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([playerId, score]) => playerId && typeof score === "number" && Number.isFinite(score))
      .map(([playerId, score]) => [playerId, Math.max(0, Math.floor(score as number))]),
  );
}

function normalizePlayers(value: unknown): TahoiyaPlayer[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((player): player is TahoiyaPlayer => Boolean(player?.id && player?.name))
    .slice(0, onlineRoomPlayerLimits.tahoiya)
    .map((player) => ({
      id: String(player.id).slice(0, 80),
      name: String(player.name).trim().slice(0, 40),
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
    }));
}

function normalizeOptions(value: unknown): TahoiyaDefinitionOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((option): option is TahoiyaDefinitionOption => Boolean(option?.id && option?.text))
    .map((option) => ({
      id: String(option.id),
      text: String(option.text),
      authorId: typeof option.authorId === "string" ? option.authorId : null,
      isReal: Boolean(option.isReal),
    }));
}

function normalizeStringRecord(value: unknown) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => key && typeof item === "string")
      .map(([key, item]) => [key, item as string]),
  );
}

export function normalizeTahoiyaRoom(value: unknown): TahoiyaRoom | null {
  if (!value || typeof value !== "object") return null;

  const parsed = value as Partial<TahoiyaRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  const players = normalizePlayers(parsed.players);
  const parentId = typeof parsed.parentId === "string" ? parsed.parentId : hostId;
  const playMode = parsed.playMode === "all-vote" ? "all-vote" : "single-answerer";

  if (!code || !hostId || players.length === 0) return null;

  return {
    code,
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, onlineRoomPassphraseMaximumLength) : "",
    phase: isPhase(parsed.phase) ? parsed.phase : "lobby",
    debugMode: Boolean(parsed.debugMode),
    debugReplayEnabled: Boolean(parsed.debugMode && parsed.debugReplayEnabled),
    lobbyReturn: normalizeRoomLobbyReturnState(parsed.lobbyReturn, players),
    players,
    ...normalizePlayerTimeoutFields(parsed, players.map((player) => player.id)),
    parentId,
    playMode,
    topicDifficulty: parsed.topicDifficulty === "extreme" ? "extreme" : "standard",
    answererMode: isAnswererMode(parsed.answererMode) ? parsed.answererMode : "random",
    showRealDefinitionToWriters: playMode === "single-answerer" && parsed.showRealDefinitionToWriters !== false,
    actionTimeLimitSeconds: normalizeCommonTimeLimit(parsed.actionTimeLimitSeconds),
    correctVotePoints: typeof parsed.correctVotePoints === "number" && Number.isInteger(parsed.correctVotePoints) ? Math.max(0, Math.min(10, parsed.correctVotePoints)) : TAHOIYA_CORRECT_VOTE_POINTS,
    fooledVotePoints: typeof parsed.fooledVotePoints === "number" && Number.isInteger(parsed.fooledVotePoints) ? Math.max(0, Math.min(10, parsed.fooledVotePoints)) : TAHOIYA_FOOLED_VOTE_POINTS,
    phaseStartedAt: typeof parsed.phaseStartedAt === "number" ? parsed.phaseStartedAt : null,
    answererId: typeof parsed.answererId === "string" ? parsed.answererId : "",
    round: typeof parsed.round === "number" ? Math.max(1, Math.floor(parsed.round)) : 1,
    word: typeof parsed.word === "string" ? parsed.word : "",
    reading: typeof parsed.reading === "string" ? parsed.reading : undefined,
    realDefinition: typeof parsed.realDefinition === "string" ? parsed.realDefinition : "",
    topicNote: typeof parsed.topicNote === "string" ? parsed.topicNote : "",
    topicSourceDetail: typeof parsed.topicSourceDetail === "string" ? parsed.topicSourceDetail : "",
    topicSource: parsed.topicSource === "llm" || parsed.topicSource === "fallback" ? parsed.topicSource : "pending",
    topicGeneration: normalizeGameGenerationMeta(parsed.topicGeneration),
    topicGenerationProgress: isPhase(parsed.phase) && parsed.phase === "lobby"
      ? normalizeTahoiyaTopicGenerationProgress(parsed.topicGenerationProgress)
      : undefined,
    fakeDefinitions: normalizeStringRecord(parsed.fakeDefinitions),
    options: normalizeOptions(parsed.options),
    votes: normalizeStringRecord(parsed.votes),
    scores: normalizeScores(parsed.scores),
    resultText: typeof parsed.resultText === "string" ? parsed.resultText : "",
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number"
      ? parsed.updatedAt
      : typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
  };
}
