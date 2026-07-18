import {
  areValidCodeInterceptClues,
  codeInterceptDefaults,
  codeInterceptPlayerLimit,
  codeInterceptTeamIds,
  isCodeLengthMode,
  isCodeRevealMode,
  isCodeInterceptTeamId,
  isValidCodeInterceptAnswer,
  normalizeCodeInterceptCardCount,
  normalizeCodeInterceptCodeLength,
  normalizeCodeInterceptPlayerCapacity,
  otherCodeInterceptTeam,
  type CodeInterceptPhase,
  type CodeInterceptPlayer,
  type CodeInterceptRoom,
  type CodeInterceptRoundLog,
  type CodeInterceptTeam,
  type CodeInterceptTeamId,
  type CodeLengthMode,
  type TeamCodeLengthChoice,
} from "@/lib/code-intercept";
import { normalizeGameDebugLog } from "@/lib/game-debug-log";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { normalizeOnlineRoomCode } from "@/lib/online-room-input";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";

function isPhase(value: unknown): value is CodeInterceptPhase {
  return value === "lobby" || value === "code-length" || value === "clue" || value === "answer" || value === "round-result" || value === "game-result";
}

function normalizePlayers(value: unknown): CodeInterceptPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const player = item as Partial<CodeInterceptPlayer>;
    const id = typeof player.id === "string" ? player.id.trim().slice(0, 120) : "";
    const name = typeof player.name === "string" ? player.name.trim().slice(0, 20) : "";
    if (!id || !name) return [];
    return [{
      id,
      name,
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      teamId: isCodeInterceptTeamId(player.teamId) ? player.teamId : "red",
      avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
      isDummy: player.isDummy === true,
      shareNameAllowed: player.shareNameAllowed === true,
    }];
  }).slice(0, codeInterceptPlayerLimit);
}

function normalizeTeams(value: unknown, cardCount: number, initialPoints: number): CodeInterceptTeam[] {
  const source = Array.isArray(value) ? value as Partial<CodeInterceptTeam>[] : [];
  return codeInterceptTeamIds.map((id) => {
    const stored = source.find((team) => team?.id === id);
    return {
      id,
      name: id === "red" ? "赤チーム" : "青チーム",
      points: typeof stored?.points === "number" && Number.isInteger(stored.points) ? Math.max(0, stored.points) : initialPoints,
      secretWords: Array.isArray(stored?.secretWords)
        ? stored.secretWords.filter((word): word is string => typeof word === "string").map((word) => word.trim().slice(0, 80)).filter(Boolean).slice(0, cardCount)
        : [],
    };
  });
}

function normalizeCodeLengthRecord(value: unknown, cardCount: number, fallbackLength: number, includeFallback = true) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => source[teamId] !== undefined || includeFallback
    ? [[teamId, normalizeCodeInterceptCodeLength(source[teamId] ?? fallbackLength, cardCount)]]
    : [])) as Partial<Record<CodeInterceptTeamId, number>>;
}

function normalizeNumberArrayRecord(value: unknown, cardCount: number, codeLengths: Partial<Record<CodeInterceptTeamId, number>>) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => {
    const answer = source[teamId];
    const codeLength = codeLengths[teamId];
    return codeLength && isValidCodeInterceptAnswer(answer, cardCount, codeLength) ? [[teamId, [...answer]]] : [];
  })) as Partial<Record<CodeInterceptTeamId, number[]>>;
}

function normalizePlayerAnswerRecord(
  value: unknown,
  players: readonly CodeInterceptPlayer[],
  clueGiverIds: Partial<Record<CodeInterceptTeamId, string>>,
  cardCount: number,
  codeLengths: Partial<Record<CodeInterceptTeamId, number>>,
) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(players.flatMap((player) => {
    const answer = source[player.id];
    const codeLength = codeLengths[player.teamId];
    return player.id !== clueGiverIds[player.teamId] && codeLength && isValidCodeInterceptAnswer(answer, cardCount, codeLength)
      ? [[player.id, [...answer]]]
      : [];
  }));
}

function normalizeClueRecord(value: unknown, codeLengths: Partial<Record<CodeInterceptTeamId, number>>) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => {
    const clues = source[teamId];
    const codeLength = codeLengths[teamId];
    return codeLength && areValidCodeInterceptClues(clues, codeLength)
      ? [[teamId, clues.map((clue) => clue.trim().slice(0, 40))]]
      : [];
  })) as Partial<Record<CodeInterceptTeamId, string[]>>;
}

function normalizeCodeLengthChoices(value: unknown, cardCount: number): Partial<Record<CodeInterceptTeamId, TeamCodeLengthChoice>> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => {
    const item = source[teamId];
    if (!item || typeof item !== "object") return [];
    const choice = item as Partial<TeamCodeLengthChoice>;
    if (typeof choice.selectedByPlayerId !== "string" || !choice.selectedByPlayerId) return [];
    return [[teamId, {
      teamId,
      selectedByPlayerId: choice.selectedByPlayerId.slice(0, 120),
      codeLength: normalizeCodeInterceptCodeLength(choice.codeLength, cardCount),
      lockedAt: typeof choice.lockedAt === "number" ? choice.lockedAt : Date.now(),
    }]];
  })) as Partial<Record<CodeInterceptTeamId, TeamCodeLengthChoice>>;
}

function normalizeStringRecord(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => typeof source[teamId] === "string" && source[teamId]
    ? [[teamId, (source[teamId] as string).slice(0, 120)]]
    : [])) as Partial<Record<CodeInterceptTeamId, string>>;
}

function normalizeRoundHistory(value: unknown, cardCount: number, fallbackMode: CodeLengthMode, fallbackLength: number): CodeInterceptRoundLog[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CodeInterceptRoundLog => Boolean(
    item && typeof item === "object" && Number.isInteger((item as CodeInterceptRoundLog).roundNumber) && Array.isArray((item as CodeInterceptRoundLog).teams),
  )).map((item) => ({
    ...item,
    codeLengthMode: isCodeLengthMode(item.codeLengthMode) ? item.codeLengthMode : fallbackMode,
    teams: item.teams.map((team) => ({
      ...team,
      codeLength: normalizeCodeInterceptCodeLength(team.codeLength ?? team.secretCode?.length ?? fallbackLength, cardCount),
      codeLengthSelectedByPlayerId: typeof team.codeLengthSelectedByPlayerId === "string" ? team.codeLengthSelectedByPlayerId : null,
    })),
  })).slice(-100);
}

export function normalizeCodeInterceptRoom(value: unknown): CodeInterceptRoom | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<CodeInterceptRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const players = normalizePlayers(parsed.players);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  if (!code || !hostId || players.length === 0 || !players.some((player) => player.id === hostId)) return null;
  const legacy = value as { codeLength?: unknown };
  const cardCount = normalizeCodeInterceptCardCount(parsed.cardCount);
  const codeLengthMode: CodeLengthMode = isCodeLengthMode(parsed.codeLengthMode) ? parsed.codeLengthMode : codeInterceptDefaults.codeLengthMode;
  const fixedCodeLength = normalizeCodeInterceptCodeLength(parsed.fixedCodeLength ?? legacy.codeLength, cardCount);
  const phase = isPhase(parsed.phase) ? parsed.phase : "lobby";
  const roundCodeLengths = phase === "lobby"
    ? {}
    : codeLengthMode === "fixed"
      ? normalizeCodeLengthRecord(parsed.roundCodeLengths, cardCount, fixedCodeLength)
      : normalizeCodeLengthRecord(parsed.roundCodeLengths, cardCount, fixedCodeLength, false);
  const initialPoints = typeof parsed.initialPoints === "number" && Number.isInteger(parsed.initialPoints)
    ? Math.max(1, Math.min(30, parsed.initialPoints))
    : codeInterceptDefaults.initialPoints;
  const winner = parsed.winner === "red" || parsed.winner === "blue" || parsed.winner === "draw" ? parsed.winner : null;
  const clueGiverIds = normalizeStringRecord(parsed.clueGiverIds);
  const enemyCodeLengths = Object.fromEntries(codeInterceptTeamIds.map((teamId) => [teamId, roundCodeLengths[otherCodeInterceptTeam(teamId)]]));
  return {
    code,
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId.slice(0, 120) : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, 40) : "",
    phase,
    players,
    playerCapacity: normalizeCodeInterceptPlayerCapacity(parsed.playerCapacity, players.length),
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : 1,
    roundNumber: typeof parsed.roundNumber === "number" ? Math.max(1, Math.floor(parsed.roundNumber)) : 1,
    cardCount,
    codeLengthMode,
    codeRevealMode: isCodeRevealMode(parsed.codeRevealMode) ? parsed.codeRevealMode : codeInterceptDefaults.codeRevealMode,
    fixedCodeLength,
    initialPoints,
    miscommunicationDamage: typeof parsed.miscommunicationDamage === "number" && Number.isInteger(parsed.miscommunicationDamage) ? Math.max(0, Math.min(10, parsed.miscommunicationDamage)) : codeInterceptDefaults.miscommunicationDamage,
    interceptionDamage: typeof parsed.interceptionDamage === "number" && Number.isInteger(parsed.interceptionDamage) ? Math.max(0, Math.min(10, parsed.interceptionDamage)) : codeInterceptDefaults.interceptionDamage,
    interceptionStartsAtRound: typeof parsed.interceptionStartsAtRound === "number" && Number.isInteger(parsed.interceptionStartsAtRound) ? Math.max(1, Math.min(10, parsed.interceptionStartsAtRound)) : codeInterceptDefaults.interceptionStartsAtRound,
    actionTimeLimitSeconds: normalizeCommonTimeLimit(parsed.actionTimeLimitSeconds),
    phaseStartedAt: typeof parsed.phaseStartedAt === "number" ? parsed.phaseStartedAt : null,
    debugMode: parsed.debugMode === true,
    debugReplayEnabled: parsed.debugReplayEnabled === true && parsed.debugMode === true,
    teams: normalizeTeams(parsed.teams, cardCount, initialPoints),
    clueGiverIds,
    codeLengthChoices: normalizeCodeLengthChoices(parsed.codeLengthChoices, cardCount),
    roundCodeLengths,
    secretCodes: normalizeNumberArrayRecord(parsed.secretCodes, cardCount, roundCodeLengths),
    clues: normalizeClueRecord(parsed.clues, roundCodeLengths),
    allyAnswerProposals: normalizePlayerAnswerRecord(parsed.allyAnswerProposals, players, clueGiverIds, cardCount, roundCodeLengths),
    interceptAnswerProposals: normalizePlayerAnswerRecord(parsed.interceptAnswerProposals, players, clueGiverIds, cardCount, enemyCodeLengths),
    allyAnswers: normalizeNumberArrayRecord(parsed.allyAnswers, cardCount, roundCodeLengths),
    interceptAnswers: normalizeNumberArrayRecord(parsed.interceptAnswers, cardCount, enemyCodeLengths),
    roundHistory: normalizeRoundHistory(parsed.roundHistory, cardCount, codeLengthMode, fixedCodeLength),
    winner,
    debugLog: normalizeGameDebugLog(parsed.debugLog),
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}
