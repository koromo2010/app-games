import type { GameDebugLogEntry } from "./game-debug-log.ts";
import { onlineRoomPlayerLimits } from "./online-room-policy.ts";

export const codeInterceptGameId = "code-intercept" as const;
export const codeInterceptMinimumPlayers = 4;
export const codeInterceptPlayerLimit = onlineRoomPlayerLimits.codeIntercept;
export const codeInterceptTeamIds = ["red", "blue"] as const;
export type CodeInterceptTeamId = (typeof codeInterceptTeamIds)[number];
export type CodeLengthMode = "fixed" | "per-round";

export const codeInterceptMinimumCardCount = 2;
export const codeInterceptMaximumCardCount = 8;

export const codeInterceptDefaults = {
  cardCount: 4,
  codeLengthMode: "fixed" as CodeLengthMode,
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
  fixedCodeLength: number;
  initialPoints: number;
  miscommunicationDamage: number;
  interceptionDamage: number;
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
  allyAnswers: Partial<Record<CodeInterceptTeamId, number[]>>;
  interceptAnswers: Partial<Record<CodeInterceptTeamId, number[]>>;
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
  | { type: "set-config"; actorId: string; cardCount: number; codeLengthMode: CodeLengthMode; fixedCodeLength?: number; actionTimeLimitSeconds: number }
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

export function clueGiverForRound(players: readonly CodeInterceptPlayer[], teamId: CodeInterceptTeamId, roundNumber: number) {
  const members = players.filter((player) => player.teamId === teamId);
  return members[(Math.max(1, roundNumber) - 1) % members.length]?.id ?? "";
}

export function finishCodeInterceptRound(room: CodeInterceptRoom): CodeInterceptRoom {
  const results = codeInterceptTeamIds.map((teamId): CodeInterceptTeamRoundResult => {
    const enemyId = otherCodeInterceptTeam(teamId);
    const team = room.teams.find((item) => item.id === teamId)!;
    const secretCode = room.secretCodes[teamId] ?? [];
    const allyAnswer = room.allyAnswers[teamId] ?? null;
    const enemyInterceptAnswer = room.roundNumber >= codeInterceptDefaults.interceptionStartsAtRound
      ? room.interceptAnswers[enemyId] ?? null
      : null;
    const allyCorrect = codesEqual(allyAnswer, secretCode);
    const enemyIntercepted = room.roundNumber >= codeInterceptDefaults.interceptionStartsAtRound
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
      pointsAfter: Math.max(0, team.points - totalDamage),
    };
  });
  const teams = room.teams.map((team) => ({
    ...team,
    points: results.find((result) => result.teamId === team.id)?.pointsAfter ?? team.points,
  }));
  const redZero = teams.find((team) => team.id === "red")!.points === 0;
  const blueZero = teams.find((team) => team.id === "blue")!.points === 0;
  const winner: CodeInterceptWinner = redZero && blueZero ? "draw" : redZero ? "blue" : blueZero ? "red" : null;
  return {
    ...room,
    teams,
    phase: winner ? "game-result" : "round-result",
    roundHistory: [...room.roundHistory, { roundNumber: room.roundNumber, codeLengthMode: room.codeLengthMode, teams: results }],
    winner,
    phaseStartedAt: Date.now(),
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
  const secretCodes = Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => {
    const visible = revealCurrentCodes || (room.phase === "clue" && room.clueGiverIds[teamId] === playerId);
    return visible && room.secretCodes[teamId] ? [[teamId, [...room.secretCodes[teamId]!]]] : [];
  })) as CodeInterceptRoom["secretCodes"];
  const clues = room.phase === "clue" && viewerTeam
    ? (room.clues[viewerTeam] ? { [viewerTeam]: [...room.clues[viewerTeam]!] } : {})
    : Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => room.clues[teamId] ? [[teamId, [...room.clues[teamId]!]]] : []));
  const allyAnswers = revealCurrentCodes
    ? room.allyAnswers
    : viewerTeam && room.allyAnswers[viewerTeam] ? { [viewerTeam]: [...room.allyAnswers[viewerTeam]!] } : {};
  const interceptAnswers = revealCurrentCodes
    ? room.interceptAnswers
    : viewerTeam && room.interceptAnswers[viewerTeam] ? { [viewerTeam]: [...room.interceptAnswers[viewerTeam]!] } : {};
  const codeLengthChoices = room.phase === "code-length" && viewerTeam
    ? (room.codeLengthChoices[viewerTeam] ? { [viewerTeam]: { ...room.codeLengthChoices[viewerTeam]! } } : {})
    : Object.fromEntries(codeInterceptTeamIds.flatMap((teamId) => room.codeLengthChoices[teamId] ? [[teamId, { ...room.codeLengthChoices[teamId]! }]] : []));
  const roundCodeLengths = room.phase === "code-length" ? {} : { ...room.roundCodeLengths };
  return { ...room, passphrase: "", teams, codeLengthChoices, roundCodeLengths, secretCodes, clues, allyAnswers, interceptAnswers };
}
