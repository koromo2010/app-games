import {
  clueGiverForRound,
  codeInterceptTeamHasSubmittedAnswers,
  codeInterceptTeamIds,
  randomizeCodeInterceptPlayers,
  shuffledCode,
  type CodeInterceptRoom,
  type CodeInterceptTeamId,
} from "@/lib/code-intercept";
import { listLocalWordWolfWords } from "@/lib/wordwolf";

export function dealSecretWords(cardCount: number) {
  const pool = [...new Set(listLocalWordWolfWords().map((word) => word.trim()).filter(Boolean))];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  const needed = cardCount * 2;
  if (pool.length < needed) throw new Error("CODE_INTERCEPT_WORDS_UNAVAILABLE");
  return { red: pool.slice(0, cardCount), blue: pool.slice(cardCount, needed) };
}

export function beginCluePhase(room: CodeInterceptRoom, roundCodeLengths: Partial<Record<CodeInterceptTeamId, number>>) {
  const now = Date.now();
  return {
    ...room,
    phase: "clue" as const,
    roundCodeLengths,
    secretCodes: Object.fromEntries(codeInterceptTeamIds.map((teamId) => [teamId, shuffledCode(room.cardCount, roundCodeLengths[teamId] ?? room.fixedCodeLength)])),
    phaseStartedAt: now,
  };
}

export function beginRound(room: CodeInterceptRoom, roundNumber: number) {
  const prepared = {
    ...room,
    phase: room.codeLengthMode === "per-round" ? "code-length" as const : "clue" as const,
    roundNumber,
    clueGiverIds: Object.fromEntries(codeInterceptTeamIds.map((teamId) => [teamId, clueGiverForRound(room.players, teamId, roundNumber)])),
    codeLengthChoices: {},
    roundCodeLengths: {},
    secretCodes: {},
    clues: {},
    allyAnswerProposals: {},
    interceptAnswerProposals: {},
    allyAnswers: {},
    interceptAnswers: {},
    winner: null,
    phaseStartedAt: Date.now(),
  };
  return room.codeLengthMode === "fixed"
    ? beginCluePhase(prepared, Object.fromEntries(codeInterceptTeamIds.map((teamId) => [teamId, room.fixedCodeLength])))
    : prepared;
}

export function beginGame(room: CodeInterceptRoom) {
  const words = dealSecretWords(room.cardCount);
  const teams = codeInterceptTeamIds.map((id) => ({ id, name: id === "red" ? "赤チーム" : "青チーム", points: room.initialPoints, secretWords: words[id] }));
  const players = room.teamAssignmentMode === "random" ? randomizeCodeInterceptPlayers(room.players) : room.players;
  return beginRound({ ...room, players, teams, roundHistory: [], winner: null }, 1);
}

export function resetGame(room: CodeInterceptRoom) {
  return {
    ...room,
    gameNumber: room.gameNumber + 1,
    phase: "lobby" as const,
    roundNumber: 1,
    phaseStartedAt: null,
    debugReplayEnabled: false,
    teams: codeInterceptTeamIds.map((id) => ({ id, name: id === "red" ? "赤チーム" : "青チーム", points: room.initialPoints, secretWords: [] })),
    clueGiverIds: {},
    codeLengthChoices: {},
    roundCodeLengths: {},
    secretCodes: {},
    clues: {},
    allyAnswerProposals: {},
    interceptAnswerProposals: {},
    allyAnswers: {},
    interceptAnswers: {},
    roundHistory: [],
    winner: null,
  };
}

export function allCodeLengthsChosen(room: CodeInterceptRoom) {
  return codeInterceptTeamIds.every((teamId) => Boolean(room.codeLengthChoices[teamId]));
}

export function allCluesSubmitted(room: CodeInterceptRoom) {
  return codeInterceptTeamIds.every((teamId) => Boolean(room.clues[teamId]));
}

export function allAnswersSubmitted(room: CodeInterceptRoom) {
  return codeInterceptTeamIds.every((teamId) => codeInterceptTeamHasSubmittedAnswers(room, teamId));
}

export function targetPlayer(room: CodeInterceptRoom, actorId: string, playerId?: string) {
  const targetId = playerId || actorId;
  const target = room.players.find((player) => player.id === targetId);
  const actorIsHost = actorId === room.hostId;
  if (!target || (targetId !== actorId && !(actorIsHost && room.debugMode && target.isDummy))) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
  return target;
}
