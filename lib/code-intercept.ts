import type { GameDebugLogEntry } from "./game-debug-log.ts";
import { onlineRoomPlayerLimits } from "./online-room-policy.ts";
import { runtimeHyperparameterNumber } from "./runtime-hyperparameters-core.ts";

export const codeInterceptGameId = "code-intercept" as const;
export const codeInterceptMinimumPlayers = 4;
export const codeInterceptPlayerLimit = onlineRoomPlayerLimits.codeIntercept;
export const codeInterceptTeamIds = ["red", "blue"] as const;
export const codeInterceptTimedPhases = ["code-length", "clue", "answer"] as const;
export type CodeInterceptTeamId = (typeof codeInterceptTeamIds)[number];
export type CodeLengthMode = "fixed" | "per-round";
export type CodeRevealMode = "all" | "own-team";

export const codeInterceptMinimumCardCount = 2;
export const codeInterceptMaximumCardCount = 8;

export const codeInterceptDefaults = {
  cardCount: 4,
  codeLengthMode: "fixed" as CodeLengthMode,
  codeRevealMode: "all" as CodeRevealMode,
  fixedCodeLength: 3,
  initialPoints: 5,
  miscommunicationDamage: 1,
  interceptionDamage: 2,
  interceptionStartsAtRound: 2,
  actionTimeLimitSeconds: 0,
} as const;

export type CodeInterceptPhase = "lobby" | "code-length" | "clue" | "answer" | "round-result" | "game-result";

export type CodeInterceptPlayer = {
  id: string;
  name: string;
  joinedAt: number;
  teamId: CodeInterceptTeamId;
  avatarColor?: string;
  avatarImage?: string;
  isDummy?: boolean;
  shareNameAllowed?: boolean;
};

export type CodeInterceptTeam = {
  id: CodeInterceptTeamId;
  name: string;
  points: number;
  secretWords: string[];
};

export type CodeInterceptTeamRoundResult = {
  teamId: CodeInterceptTeamId;
  clueGiverId: string;
  codeLength: number;
  codeLengthSelectedByPlayerId: string | null;
  secretCode: number[];
  clues: string[];
  allyAnswer: number[] | null;
  allyCorrect: boolean;
  enemyInterceptAnswer: number[] | null;
  enemyIntercepted: boolean;
  miscommunicationDamage: number;
  interceptionDamage: number;
  totalDamage: number;
  pointsBefore: number;
  pointsAfter: number;
};

export type CodeInterceptRoundLog = {
  roundNumber: number;
  codeLengthMode: CodeLengthMode;
  teams: CodeInterceptTeamRoundResult[];
};

export type CodeInterceptClueHistoryEntry = {
  roundNumber: number;
  clue: string;
};

export type TeamCodeLengthChoice = {
  teamId: CodeInterceptTeamId;
  selectedByPlayerId: string;
  codeLength: number;
  lockedAt: number;
};

export type CodeInterceptWinner = CodeInterceptTeamId | "draw" | null;

export type CodeInterceptRoom = {
  code: string;
  revision: number;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: CodeInterceptPhase;
  players: CodeInterceptPlayer[];
  playerCapacity: number;
  gameNumber: number;
  roundNumber: number;
  cardCount: number;
  codeLengthMode: CodeLengthMode;
  codeRevealMode: CodeRevealMode;
  fixedCodeLength: number;
  initialPoints: number;
  miscommunicationDamage: number;
  interceptionDamage: number;
  interceptionStartsAtRound: number;
  actionTimeLimitSeconds: number;
  phaseStartedAt: number | null;
  debugMode: boolean;
  debugReplayEnabled: boolean;
  teams: CodeInterceptTeam[];
  clueGiverIds: Partial<Record<CodeInterceptTeamId, string>>;
  codeLengthChoices: Partial<Record<CodeInterceptTeamId, TeamCodeLengthChoice>>;
  roundCodeLengths: Partial<Record<CodeInterceptTeamId, number>>;
  secretCodes: Partial<Record<CodeInterceptTeamId, number[]>>;
  clues: Partial<Record<CodeInterceptTeamId, string[]>>;
  allyAnswerProposals: Record<string, number[]>;
  interceptAnswerProposals: Record<string, number[]>;
  allyAnswers: Partial<Record<CodeInterceptTeamId, number[]>>;
  interceptAnswers: Partial<Record<CodeInterceptTeamId, number[]>>;
  answerReadyTeamIds?: CodeInterceptTeamId[];
  roundHistory: CodeInterceptRoundLog[];
  winner: CodeInterceptWinner;
  debugLog: GameDebugLogEntry[];
  createdAt: number;
  updatedAt: number;
};

export type CodeInterceptRoomChoice = {
  code: string;
  hostName: string;
  playerCount: number;
  playerCapacity: number;
  hasPassphrase: boolean;
  redCount: number;
  blueCount: number;
  updatedAt: number;
};

export type CodeInterceptRoomAction =
  | { type: "join-room"; actorId: string; player: CodeInterceptPlayer; passphrase: string }
  | { type: "leave-room"; actorId: string }
  | { type: "set-team"; actorId: string; teamId: CodeInterceptTeamId }
  | { type: "set-debug"; actorId: string; enabled: boolean }
  | { type: "set-debug-replay"; actorId: string; enabled: boolean }
  | { type: "set-config"; actorId: string; cardCount: number; codeLengthMode: CodeLengthMode; codeRevealMode: CodeRevealMode; fixedCodeLength?: number; actionTimeLimitSeconds: number }
  | { type: "expire-phase"; actorId: string; phaseStartedAt: number }
  | { type: "start-game"; actorId: string }
  | { type: "select-code-length"; actorId: string; playerId?: string; codeLength: number }
  | { type: "submit-clues"; actorId: string; playerId?: string; clues: string[] }
  | { type: "submit-ally-answer"; actorId: string; playerId?: string; answer: number[] }
  | { type: "submit-intercept-answer"; actorId: string; playerId?: string; answer: number[] }
  | { type: "next-round"; actorId: string }
  | { type: "reset-game"; actorId: string }
  | { type: "abort-game"; actorId: string }
  | { type: "debug-add-player"; actorId: string }
  | { type: "debug-fill-code-lengths"; actorId: string }
  | { type: "debug-fill-clues"; actorId: string }
  | { type: "debug-fill-answers"; actorId: string };

export function otherCodeInterceptTeam(teamId: CodeInterceptTeamId): CodeInterceptTeamId {
  return teamId === "red" ? "blue" : "red";
}

export function normalizeCodeInterceptPlayerCapacity(value: unknown, currentPlayerCount = 1) {
  const requested = typeof value === "number" && Number.isInteger(value) ? value : 8;
  return Math.min(codeInterceptPlayerLimit, Math.max(codeInterceptMinimumPlayers, currentPlayerCount, requested));
}

export function codeInterceptRoomHasSpace(room: Pick<CodeInterceptRoom, "players" | "playerCapacity">) {
  return room.players.length < room.playerCapacity;
}

export function isCodeInterceptTeamId(value: unknown): value is CodeInterceptTeamId {
  return value === "red" || value === "blue";
}

export function isCodeLengthMode(value: unknown): value is CodeLengthMode {
  return value === "fixed" || value === "per-round";
}

export function isCodeRevealMode(value: unknown): value is CodeRevealMode {
  return value === "all" || value === "own-team";
}

export function normalizeCodeInterceptCardCount(value: unknown) {
  const count = typeof value === "number" && Number.isInteger(value) ? value : codeInterceptDefaults.cardCount;
  return Math.min(codeInterceptMaximumCardCount, Math.max(codeInterceptMinimumCardCount, count));
}

export function normalizeCodeInterceptCodeLength(value: unknown, cardCount: number) {
  const length = typeof value === "number" && Number.isInteger(value) ? value : Math.min(codeInterceptDefaults.fixedCodeLength, cardCount);
  return Math.min(cardCount, Math.max(2, length));
}

export function codeLengthForTeam(room: Pick<CodeInterceptRoom, "roundCodeLengths" | "fixedCodeLength">, teamId: CodeInterceptTeamId) {
  return room.roundCodeLengths[teamId] ?? room.fixedCodeLength;
}

export function teamPlayers(room: Pick<CodeInterceptRoom, "players">, teamId: CodeInterceptTeamId) {
  return room.players.filter((player) => player.teamId === teamId);
}

export function codeInterceptTeamsAreStartable(room: Pick<CodeInterceptRoom, "players">) {
  const red = teamPlayers(room, "red").length;
  const blue = teamPlayers(room, "blue").length;
  return red >= 2 && blue >= 2 && Math.abs(red - blue) <= 1;
}

export function nextBalancedTeam(players: readonly Pick<CodeInterceptPlayer, "teamId">[]): CodeInterceptTeamId {
  const red = players.filter((player) => player.teamId === "red").length;
  const blue = players.length - red;
  return red <= blue ? "red" : "blue";
}

export function shuffledCode(cardCount: number, codeLength: number, random = Math.random) {
  const values = Array.from({ length: cardCount }, (_, index) => index + 1);
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values.slice(0, codeLength);
}

export function isValidCodeInterceptAnswer(answer: unknown, cardCount: number, codeLength: number): answer is number[] {
  return Array.isArray(answer)
    && answer.length === codeLength
    && answer.every((value) => Number.isInteger(value) && value >= 1 && value <= cardCount)
    && new Set(answer).size === answer.length;
}

export function areValidCodeInterceptClues(clues: unknown, codeLength: number): clues is string[] {
  return Array.isArray(clues)
    && clues.length === codeLength
    && clues.every((clue) => typeof clue === "string" && clue.trim().length > 0 && clue.trim().length <= 40);
}

export function codesEqual(left: readonly number[] | null | undefined, right: readonly number[] | null | undefined) {
  return Boolean(left && right && left.length === right.length && left.every((value, index) => value === right[index]));
}

export function codeInterceptClueHistory(
  room: Pick<CodeInterceptRoom, "cardCount" | "roundHistory">,
  teamId: CodeInterceptTeamId,
) {
  const numbered = Array.from({ length: room.cardCount }, (_, index) => ({
    cardNumber: index + 1,
    clues: [] as CodeInterceptClueHistoryEntry[],
  }));
  const unknown: CodeInterceptClueHistoryEntry[] = [];
  room.roundHistory.forEach((round) => {
    const result = round.teams.find((team) => team.teamId === teamId);
    if (!result) return;
    if (!result.allyCorrect) {
      result.clues.forEach((clue) => unknown.push({ roundNumber: round.roundNumber, clue }));
      return;
    }
    if (result.secretCode.length === 0) return;
    result.secretCode.forEach((cardNumber, clueIndex) => {
      const clue = result.clues[clueIndex];
      if (clue && numbered[cardNumber - 1]) numbered[cardNumber - 1].clues.push({ roundNumber: round.roundNumber, clue });
    });
  });
  return { numbered, unknown };
}

export function codeInterceptAnswererIds(room: Pick<CodeInterceptRoom, "players" | "clueGiverIds">, teamId: CodeInterceptTeamId) {
  return room.players
    .filter((player) => player.teamId === teamId && player.id !== room.clueGiverIds[teamId])
    .map((player) => player.id);
}

export function consensusCodeInterceptAnswer(proposals: Readonly<Record<string, number[]>>, answererIds: readonly string[]) {
  if (answererIds.length === 0) return null;
  const first = proposals[answererIds[0]];
  return first && answererIds.every((playerId) => codesEqual(proposals[playerId], first)) ? [...first] : null;
}

export function codeInterceptTeamHasSubmittedAnswers(room: Pick<CodeInterceptRoom, "allyAnswers" | "interceptAnswers" | "roundNumber" | "interceptionStartsAtRound">, teamId: CodeInterceptTeamId) {
  return Boolean(room.allyAnswers[teamId])
    && (room.roundNumber < room.interceptionStartsAtRound || Boolean(room.interceptAnswers[teamId]));
}

export function canReviseCodeInterceptAnswers(room: Pick<CodeInterceptRoom, "phase" | "allyAnswers" | "interceptAnswers" | "roundNumber" | "interceptionStartsAtRound">, teamId: CodeInterceptTeamId) {
  return room.phase === "answer" && !codeInterceptTeamHasSubmittedAnswers(room, otherCodeInterceptTeam(teamId));
}

export function isCodeInterceptTimedPhase(phase: CodeInterceptPhase): phase is (typeof codeInterceptTimedPhases)[number] {
  return codeInterceptTimedPhases.includes(phase as (typeof codeInterceptTimedPhases)[number]);
}

export function isCodeInterceptPhaseExpired(
  room: Pick<CodeInterceptRoom, "phase" | "phaseStartedAt" | "actionTimeLimitSeconds">,
  now = Date.now(),
) {
  return isCodeInterceptTimedPhase(room.phase)
    && room.actionTimeLimitSeconds > 0
    && typeof room.phaseStartedAt === "number"
    && now >= room.phaseStartedAt + room.actionTimeLimitSeconds * 1000;
}

export function expireCodeInterceptPhase(room: CodeInterceptRoom, now = Date.now()): CodeInterceptRoom {
  if (!isCodeInterceptPhaseExpired(room, now)) return room;
  if (room.phase === "code-length") {
    const codeLengthChoices = { ...room.codeLengthChoices };
    codeInterceptTeamIds.forEach((teamId) => {
      if (codeLengthChoices[teamId]) return;
      codeLengthChoices[teamId] = {
        teamId,
        selectedByPlayerId: room.clueGiverIds[teamId] ?? room.hostId,
        codeLength: room.fixedCodeLength,
        lockedAt: now,
      };
    });
    const roundCodeLengths = Object.fromEntries(codeInterceptTeamIds.map((teamId) => [teamId, codeLengthChoices[teamId]!.codeLength]));
    return {
      ...room,
      phase: "clue",
      codeLengthChoices,
      roundCodeLengths,
      secretCodes: Object.fromEntries(codeInterceptTeamIds.map((teamId) => [teamId, shuffledCode(room.cardCount, roundCodeLengths[teamId]!)])),
      phaseStartedAt: now,
    };
  }
  if (room.phase === "clue") {
    const clues = { ...room.clues };
    codeInterceptTeamIds.forEach((teamId) => {
      clues[teamId] ??= Array.from({ length: codeLengthForTeam(room, teamId) }, () => "時間切れ");
    });
    return { ...room, phase: "answer", clues, phaseStartedAt: now };
  }
  return finishCodeInterceptRound(room);
}

export function withCodeInterceptConsensusAnswer(answers: Partial<Record<CodeInterceptTeamId, number[]>>, teamId: CodeInterceptTeamId, consensus: number[] | null) {
  const next = { ...answers };
  if (consensus) next[teamId] = [...consensus];
  else delete next[teamId];
  return next;
}

export function clueGiverForRound(players: readonly CodeInterceptPlayer[], teamId: CodeInterceptTeamId, roundNumber: number) {
  const members = players.filter((player) => player.teamId === teamId);
  return members[(Math.max(1, roundNumber) - 1) % members.length]?.id ?? "";
}

export function finishCodeInterceptRound(room: CodeInterceptRoom): CodeInterceptRoom {
  const interceptionStartsAtRound = room.interceptionStartsAtRound ?? codeInterceptDefaults.interceptionStartsAtRound;
  const results = codeInterceptTeamIds.map((teamId): CodeInterceptTeamRoundResult => {
    const enemyId = otherCodeInterceptTeam(teamId);
    const team = room.teams.find((item) => item.id === teamId)!;
    const secretCode = room.secretCodes[teamId] ?? [];
    const allyAnswer = room.allyAnswers[teamId] ?? null;
    const enemyInterceptAnswer = room.roundNumber >= interceptionStartsAtRound
      ? room.interceptAnswers[enemyId] ?? null
      : null;
    const allyCorrect = codesEqual(allyAnswer, secretCode);
    const enemyIntercepted = room.roundNumber >= interceptionStartsAtRound
      && codesEqual(enemyInterceptAnswer, secretCode);
    const miscommunicationDamage = allyCorrect ? 0 : room.miscommunicationDamage;
    const interceptionDamage = enemyIntercepted ? room.interceptionDamage : 0;
    const totalDamage = miscommunicationDamage + interceptionDamage;
    return {
      teamId,
      clueGiverId: room.clueGiverIds[teamId] ?? "",
      codeLength: codeLengthForTeam(room, teamId),
      codeLengthSelectedByPlayerId: room.codeLengthMode === "per-round" ? room.codeLengthChoices[teamId]?.selectedByPlayerId ?? null : null,
      secretCode: [...secretCode],
      clues: [...(room.clues[teamId] ?? [])],
      allyAnswer: allyAnswer ? [...allyAnswer] : null,
      allyCorrect,
      enemyInterceptAnswer: enemyInterceptAnswer ? [...enemyInterceptAnswer] : null,
      enemyIntercepted,
      miscommunicationDamage,
      interceptionDamage,
      totalDamage,
      pointsBefore: team.points,
      pointsAfter: team.points - totalDamage,
    };
  });
  const teams = room.teams.map((team) => ({
    ...team,
    points: results.find((result) => result.teamId === team.id)?.pointsAfter ?? team.points,
  }));
  const redPoints = teams.find((team) => team.id === "red")!.points;
  const bluePoints = teams.find((team) => team.id === "blue")!.points;
  const redEliminated = redPoints <= 0;
  const blueEliminated = bluePoints <= 0;
  const winner: CodeInterceptWinner = redEliminated && blueEliminated
    ? redPoints === bluePoints ? "draw" : redPoints > bluePoints ? "red" : "blue"
    : redEliminated ? "blue" : blueEliminated ? "red" : null;
  return {
    ...room,
    teams,
    phase: winner ? "game-result" : "round-result",
    roundHistory: [...room.roundHistory, { roundNumber: room.roundNumber, codeLengthMode: room.codeLengthMode, teams: results }],
    winner,
    phaseStartedAt: Date.now(),
  };
}

export function codeInterceptRuntimeBalance() {
  return {
    initialPoints: runtimeHyperparameterNumber("code-points", codeInterceptDefaults.initialPoints),
    miscommunicationDamage: runtimeHyperparameterNumber("code-miss", codeInterceptDefaults.miscommunicationDamage),
    interceptionDamage: runtimeHyperparameterNumber("code-intercept", codeInterceptDefaults.interceptionDamage),
    interceptionStartsAtRound: runtimeHyperparameterNumber("code-start", codeInterceptDefaults.interceptionStartsAtRound),
  };
}

export function codeInterceptShareText(room: Pick<CodeInterceptRoom, "winner" | "roundNumber" | "teams">) {
  const winner = room.winner === "draw" ? "同時決着で引き分け" : room.winner === "red" ? "赤チームの勝利" : room.winner === "blue" ? "青チームの勝利" : "対戦中";
  const points = codeInterceptTeamIds.map((id) => `${id === "red" ? "赤" : "青"}${room.teams.find((team) => team.id === id)?.points ?? 0}`).join("・");
  return [`コードインターセプト`, `${room.roundNumber}ラウンドで${winner}`, `残りポイント ${points}`, "#GameFields"].join("\n");
}

export function sanitizeCodeInterceptRoomForPlayer(room: CodeInterceptRoom, playerId: string): CodeInterceptRoom {
  const viewer = room.players.find((player) => player.id === playerId);
  const viewerTeam = viewer?.teamId;
  const revealAll = room.phase === "game-result";
  const teams = room.teams.map((team) => ({
    ...team,
    secretWords: revealAll || team.id === viewerTeam ? [...team.secretWords] : [],
  }));
  const revealCurrentCodes = room.phase === "round-result" || room.phase === "game-result";
  const canSeeTeamCode = (teamId: CodeInterceptTeamId) => room.codeRevealMode === "all" || teamId === viewerTeam;
  const canSeeTeamDiscussion = Boolean(viewerTeam && room.phase === "answer" && room.clueGiverIds[viewerTeam] !== playerId);
  const secretCodes = Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => {
    const visible = (revealCurrentCodes && canSeeTeamCode(teamId)) || (room.phase === "clue" && room.clueGiverIds[teamId] === playerId);
    return visible && room.secretCodes[teamId] ? [[teamId, [...room.secretCodes[teamId]!]]] : [];
  })) as CodeInterceptRoom["secretCodes"];
  const clues = room.phase === "clue" && viewerTeam
    ? (room.clues[viewerTeam] ? { [viewerTeam]: [...room.clues[viewerTeam]!] } : {})
    : Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => room.clues[teamId] ? [[teamId, [...room.clues[teamId]!]]] : []));
  const allyAnswers = revealCurrentCodes
    ? Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => canSeeTeamCode(teamId) && room.allyAnswers[teamId]
      ? [[teamId, [...room.allyAnswers[teamId]!]]]
      : [])) as CodeInterceptRoom["allyAnswers"]
    : canSeeTeamDiscussion && viewerTeam && room.allyAnswers[viewerTeam] ? { [viewerTeam]: [...room.allyAnswers[viewerTeam]!] } : {};
  const interceptAnswers = revealCurrentCodes
    ? room.interceptAnswers
    : canSeeTeamDiscussion && viewerTeam && room.interceptAnswers[viewerTeam] ? { [viewerTeam]: [...room.interceptAnswers[viewerTeam]!] } : {};
  const visibleAnswererIds = canSeeTeamDiscussion && viewerTeam ? new Set(codeInterceptAnswererIds(room, viewerTeam)) : new Set<string>();
  const visibleProposals = (proposals: Readonly<Record<string, number[]>>) => Object.fromEntries(
    Object.entries(proposals).flatMap(([proposalPlayerId, answer]) => visibleAnswererIds.has(proposalPlayerId)
      ? [[proposalPlayerId, [...answer]]]
      : []),
  );
  const allyAnswerProposals = visibleProposals(room.allyAnswerProposals);
  const interceptAnswerProposals = visibleProposals(room.interceptAnswerProposals);
  const codeLengthChoices = room.phase === "code-length" && viewerTeam
    ? (room.codeLengthChoices[viewerTeam] ? { [viewerTeam]: { ...room.codeLengthChoices[viewerTeam]! } } : {})
    : Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => room.codeLengthChoices[teamId] ? [[teamId, { ...room.codeLengthChoices[teamId]! }]] : []));
  const roundCodeLengths = room.phase === "code-length" ? {} : { ...room.roundCodeLengths };
  const roundHistory = room.roundHistory.map((round) => ({
    ...round,
    teams: round.teams.map((result) => canSeeTeamCode(result.teamId)
      ? { ...result, secretCode: [...result.secretCode], allyAnswer: result.allyAnswer ? [...result.allyAnswer] : null }
      : { ...result, secretCode: [], allyAnswer: null }),
  }));
  const answerReadyTeamIds = room.phase === "answer"
    ? codeInterceptTeamIds.filter((teamId) => codeInterceptTeamHasSubmittedAnswers(room, teamId))
    : [];
  return { ...room, passphrase: "", teams, codeLengthChoices, roundCodeLengths, secretCodes, clues, allyAnswerProposals, interceptAnswerProposals, allyAnswers, interceptAnswers, answerReadyTeamIds, roundHistory };
}
