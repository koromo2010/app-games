import { randomUUID } from "node:crypto";
import {
  areValidCodeInterceptClues,
  codeInterceptAnswererIds,
  codeLengthForTeam,
  consensusCodeInterceptAnswer,
  codeInterceptRuntimeBalance,
  codeInterceptMinimumPlayers,
  codeInterceptRoomHasSpace,
  codeInterceptTeamIds,
  codeInterceptTeamsAreStartable,
  finishCodeInterceptRound,
  isCodeLengthMode,
  isCodeRevealMode,
  isCodeInterceptTeamId,
  isValidCodeInterceptAnswer,
  nextBalancedTeam,
  normalizeCodeInterceptCardCount,
  normalizeCodeInterceptCodeLength,
  otherCodeInterceptTeam,
  type CodeInterceptRoom,
  type CodeInterceptRoomAction,
} from "@/lib/code-intercept";
import { appendGameDebugLog } from "@/lib/game-debug-log";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { recordCodeInterceptReplay } from "@/lib/game-replay-store";
import { isMultiplayerRoomExpired } from "@/lib/multiplayer-room-lifecycle";
import { loadIndexedOnlineRoomPage } from "@/lib/online-room-list";
import { canLeaveOnlineRoomLobby, onlineRoomActorAccess } from "@/lib/online-room-access";
import { createIndexedOnlineRoom, mutateOnlineRoomWithRetry } from "@/lib/online-room-persistence";
import { dissolveHostedIndexedOnlineRooms, dissolveIndexedOnlineRoom } from "@/lib/online-room-dissolution";
import { claimOnlineRoomForPlayer, loadPlayerActiveOnlineRoom, releasePlayerActiveRoom, saveOnlineRoomPlayerIndexes, type ActiveRoomClaim } from "@/lib/player-active-room";
import { recordCodeInterceptGameResults } from "@/lib/player-stats-store";
import { redisCommand } from "@/lib/redis-store";
import { allAnswersSubmitted, allCluesSubmitted, allCodeLengthsChosen, beginCluePhase, beginGame, beginRound, resetGame, targetPlayer } from "@/lib/code-intercept-room-domain";
import { normalizeCodeInterceptRoom } from "@/lib/code-intercept-room-normalizer";
import { codeInterceptRoomChoice, sanitizeCodeInterceptRoom } from "@/lib/code-intercept-room-presentation";

export { sanitizeCodeInterceptRoom };

const roomKeyPrefix = "code-intercept:room:";
const roomIndexKey = "code-intercept:rooms";
const playerActiveRoomKeyPrefix = "code-intercept:player-active-room:";

const debugActionLabels: Record<CodeInterceptRoomAction["type"], string> = {
  "join-room": "部屋に参加",
  "leave-room": "部屋から退出",
  "set-team": "所属チームを変更",
  "set-debug": "デバッグモードを変更",
  "set-debug-replay": "プレイバック記録設定を変更",
  "set-config": "ゲーム設定を変更",
  "start-game": "ゲームを開始",
  "select-code-length": "暗号桁数を確定",
  "submit-clues": "暗号ヒントを提出",
  "submit-ally-answer": "味方暗号を回答",
  "submit-intercept-answer": "敵暗号の傍受回答を提出",
  "next-round": "次ラウンドへ進行",
  "reset-game": "同じ部屋で再戦準備",
  "abort-game": "ゲームを中断",
  "debug-add-player": "ダミープレイヤーを追加",
  "debug-fill-code-lengths": "未選択の暗号桁数を自動入力",
  "debug-fill-clues": "未提出ヒントを自動入力",
  "debug-fill-answers": "未提出回答を自動入力",
};

function roomKey(code: string) { return `${roomKeyPrefix}${code.trim().toUpperCase()}`; }
function playerActiveRoomKey(playerId: string) { return `${playerActiveRoomKeyPrefix}${playerId}`; }


async function mutateStoredRoom(code: string, mutate: (room: CodeInterceptRoom) => CodeInterceptRoom, actorId: string, action: string) {
  return mutateOnlineRoomWithRetry({ code, roomKey, loadRoom: loadStoredCodeInterceptRoom, mutate, normalize: normalizeCodeInterceptRoom, errors: { notFound: "CODE_INTERCEPT_ROOM_NOT_FOUND", invalid: "INVALID_CODE_INTERCEPT_ROOM", conflict: "CODE_INTERCEPT_ROOM_CONFLICT" }, prepare: (current, changed, { revision, timestamp }) => {
    const actorName = changed.players.find((player) => player.id === actorId)?.name ?? "システム";
    return changed.debugMode
      ? { ...changed, debugLog: appendGameDebugLog(changed.debugLog, { timestamp, actorName, action, phaseBefore: current.phase, phaseAfter: changed.phase, revision }) }
      : changed;
  }, afterSave: (room) => Promise.all([recordCodeInterceptGameResults(room), recordCodeInterceptReplay(room)]) });
}

async function saveActiveRooms(room: CodeInterceptRoom) {
  await saveOnlineRoomPlayerIndexes(room.code, room.players.filter((player) => !player.isDummy).map((player) => player.id), playerActiveRoomKey);
}

async function clearActiveRoom(playerId: string, code: string) { await releasePlayerActiveRoom(playerActiveRoomKey(playerId), code); }

export async function loadStoredCodeInterceptRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;
  try {
    const room = normalizeCodeInterceptRoom(JSON.parse(raw));
    if (!room) return null;
    if (isMultiplayerRoomExpired(room.updatedAt)) {
      await redisCommand<number>(["DEL", roomKey(room.code)]);
      await redisCommand<number>(["SREM", roomIndexKey, room.code]);
      await Promise.all(room.players.map((player) => clearActiveRoom(player.id, room.code)));
      return null;
    }
    return room;
  } catch { return null; }
}

export async function loadCodeInterceptPlayerActiveRoom(playerId: string) {
  return loadPlayerActiveOnlineRoom(playerId, { key: playerActiveRoomKey, loadRoom: loadStoredCodeInterceptRoom, isMember: (room, id) => room.players.some((player) => player.id === id) });
}

export async function createStoredCodeInterceptRoom(value: unknown, actorId: string) {
  const room = normalizeCodeInterceptRoom(value);
  if (!room || room.hostId !== actorId) throw new Error("INVALID_CODE_INTERCEPT_ROOM");
  const created = resetGame({ ...room, ...codeInterceptRuntimeBalance(), revision: 0, gameNumber: 0, debugMode: false, debugLog: [], createdAt: Date.now(), updatedAt: Date.now() });
  const activeRoom = await loadCodeInterceptPlayerActiveRoom(actorId);
  const claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(actorId), targetCode: created.code, currentRoom: activeRoom, gameId: "code-intercept", conflictError: "CODE_INTERCEPT_PLAYER_ALREADY_ACTIVE" });
  try {
    await createIndexedOnlineRoom(created, { roomKey, roomIndexKey, conflictError: "CODE_INTERCEPT_ROOM_CONFLICT" });
    await saveActiveRooms(created);
    return created;
  } catch (error) {
    if (claim === "claimed") await clearActiveRoom(actorId, created.code);
    throw error;
  }
}

export async function applyStoredCodeInterceptAction(code: string, action: CodeInterceptRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  const normalizedCode = code.trim().toUpperCase();
  if (action.type === "join-room") {
    const activeRoom = await loadCodeInterceptPlayerActiveRoom(action.actorId);
    claim = await claimOnlineRoomForPlayer({ key: playerActiveRoomKey(action.actorId), targetCode: normalizedCode, currentRoom: activeRoom, gameId: "code-intercept", conflictError: "CODE_INTERCEPT_PLAYER_ALREADY_ACTIVE" });
  }
  const room = await mutateStoredRoom(normalizedCode, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("CODE_INTERCEPT_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return current;
      if (!codeInterceptRoomHasSpace(current)) throw new Error("CODE_INTERCEPT_ROOM_FULL");
      return { ...current, players: [...current.players, { ...action.player, teamId: nextBalancedTeam(current.players) }] };
    }
    const { isHost, isMember } = onlineRoomActorAccess(current.hostId, current.players, action.actorId);
    if (!isMember) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
    if (action.type === "leave-room") {
      if (!canLeaveOnlineRoomLobby({ isHost, isMember }, current.phase)) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.actorId) };
    }
    if (action.type === "set-team") {
      if (current.phase !== "lobby" || !isCodeInterceptTeamId(action.teamId)) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return { ...current, players: current.players.map((player) => player.id === action.actorId ? { ...player, teamId: action.teamId } : player) };
    }
    if (action.type === "set-debug") {
      if (!isHost || current.phase !== "lobby") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return { ...current, debugMode: action.enabled, debugReplayEnabled: action.enabled ? current.debugReplayEnabled : false, debugLog: [], players: action.enabled ? current.players : current.players.filter((player) => !player.isDummy) };
    }
    if (action.type === "set-debug-replay") {
      if (!isHost || !current.debugMode) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "set-config") {
      if (!isHost || current.phase !== "lobby") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      const cardCount = normalizeCodeInterceptCardCount(action.cardCount);
      if (cardCount !== action.cardCount || !isCodeLengthMode(action.codeLengthMode) || !isCodeRevealMode(action.codeRevealMode)) throw new Error("CODE_INTERCEPT_INVALID_CONFIG");
      if (action.codeLengthMode === "fixed" && (action.fixedCodeLength === undefined || normalizeCodeInterceptCodeLength(action.fixedCodeLength, cardCount) !== action.fixedCodeLength)) throw new Error("CODE_INTERCEPT_INVALID_CONFIG");
      return {
        ...current,
        cardCount,
        codeLengthMode: action.codeLengthMode,
        codeRevealMode: action.codeRevealMode,
        fixedCodeLength: action.codeLengthMode === "fixed"
          ? action.fixedCodeLength!
          : normalizeCodeInterceptCodeLength(current.fixedCodeLength, cardCount),
        actionTimeLimitSeconds: normalizeCommonTimeLimit(action.actionTimeLimitSeconds),
      };
    }
    if (action.type === "debug-add-player") {
      if (!isHost || !current.debugMode || current.phase !== "lobby" || !codeInterceptRoomHasSpace(current)) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      const number = current.players.filter((player) => player.isDummy).length + 1;
      return { ...current, players: [...current.players, { id: `dummy-${randomUUID()}`, name: `ダミー${number}`, joinedAt: Date.now(), teamId: nextBalancedTeam(current.players), avatarColor: number % 2 ? "#f87171" : "#60a5fa", isDummy: true }] };
    }
    if (action.type === "start-game") {
      if (!isHost || current.phase !== "lobby") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      if ((!current.debugMode && current.players.length < codeInterceptMinimumPlayers) || !codeInterceptTeamsAreStartable(current)) throw new Error("CODE_INTERCEPT_NOT_ENOUGH_PLAYERS");
      return beginGame(current);
    }
    if (action.type === "abort-game") {
      if (!isHost || !current.debugMode || current.phase === "lobby") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return resetGame({ ...current, gameNumber: current.gameNumber - 1 });
    }
    if (action.type === "reset-game") {
      if (!isHost || current.phase !== "game-result") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return resetGame(current);
    }
    if (action.type === "next-round") {
      if (!isHost || current.phase !== "round-result") throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      return beginRound(current, current.roundNumber + 1);
    }
    if (action.type === "select-code-length") {
      const player = targetPlayer(current, action.actorId, action.playerId);
      if (current.codeLengthMode !== "per-round" || current.phase !== "code-length" || current.clueGiverIds[player.teamId] !== player.id || current.codeLengthChoices[player.teamId]) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      const codeLength = normalizeCodeInterceptCodeLength(action.codeLength, current.cardCount);
      if (codeLength !== action.codeLength) throw new Error("CODE_INTERCEPT_INVALID_CODE_LENGTH");
      const next = {
        ...current,
        codeLengthChoices: {
          ...current.codeLengthChoices,
          [player.teamId]: { teamId: player.teamId, selectedByPlayerId: player.id, codeLength, lockedAt: Date.now() },
        },
      };
      if (!allCodeLengthsChosen(next)) return next;
      return beginCluePhase(next, Object.fromEntries(codeInterceptTeamIds.map((teamId) => [teamId, next.codeLengthChoices[teamId]!.codeLength])));
    }
    if (action.type === "submit-clues") {
      const player = targetPlayer(current, action.actorId, action.playerId);
      if (current.phase !== "clue" || current.clueGiverIds[player.teamId] !== player.id || current.clues[player.teamId]) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      if (!areValidCodeInterceptClues(action.clues, codeLengthForTeam(current, player.teamId))) throw new Error("CODE_INTERCEPT_INVALID_CLUE");
      const next = { ...current, clues: { ...current.clues, [player.teamId]: action.clues.map((clue) => clue.trim()) } };
      return allCluesSubmitted(next) ? { ...next, phase: "answer" as const, phaseStartedAt: Date.now() } : next;
    }
    if (action.type === "submit-ally-answer") {
      const player = targetPlayer(current, action.actorId, action.playerId);
      if (current.phase !== "answer" || current.clueGiverIds[player.teamId] === player.id || current.allyAnswers[player.teamId]) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      if (!isValidCodeInterceptAnswer(action.answer, current.cardCount, codeLengthForTeam(current, player.teamId))) throw new Error("CODE_INTERCEPT_INVALID_ANSWER");
      const allyAnswerProposals = { ...current.allyAnswerProposals, [player.id]: [...action.answer] };
      const consensus = consensusCodeInterceptAnswer(allyAnswerProposals, codeInterceptAnswererIds(current, player.teamId));
      const next = {
        ...current,
        allyAnswerProposals,
        allyAnswers: consensus ? { ...current.allyAnswers, [player.teamId]: consensus } : current.allyAnswers,
      };
      return allAnswersSubmitted(next) ? finishCodeInterceptRound(next) : next;
    }
    if (action.type === "submit-intercept-answer") {
      const player = targetPlayer(current, action.actorId, action.playerId);
      if (current.phase !== "answer" || current.clueGiverIds[player.teamId] === player.id || current.roundNumber < current.interceptionStartsAtRound || current.interceptAnswers[player.teamId]) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
      if (!isValidCodeInterceptAnswer(action.answer, current.cardCount, codeLengthForTeam(current, otherCodeInterceptTeam(player.teamId)))) throw new Error("CODE_INTERCEPT_INVALID_ANSWER");
      const interceptAnswerProposals = { ...current.interceptAnswerProposals, [player.id]: [...action.answer] };
      const consensus = consensusCodeInterceptAnswer(interceptAnswerProposals, codeInterceptAnswererIds(current, player.teamId));
      const next = {
        ...current,
        interceptAnswerProposals,
        interceptAnswers: consensus ? { ...current.interceptAnswers, [player.teamId]: consensus } : current.interceptAnswers,
      };
      return allAnswersSubmitted(next) ? finishCodeInterceptRound(next) : next;
    }
    if (!isHost || !current.debugMode) throw new Error("CODE_INTERCEPT_ROOM_FORBIDDEN");
    if (action.type === "debug-fill-code-lengths" && current.phase === "code-length" && current.codeLengthMode === "per-round") {
      const choices = { ...current.codeLengthChoices };
      codeInterceptTeamIds.forEach((teamId) => {
        if (choices[teamId]) return;
        const clueGiverId = current.clueGiverIds[teamId] ?? current.hostId;
        choices[teamId] = { teamId, selectedByPlayerId: clueGiverId, codeLength: current.fixedCodeLength, lockedAt: Date.now() };
      });
      return beginCluePhase({ ...current, codeLengthChoices: choices }, Object.fromEntries(codeInterceptTeamIds.map((teamId) => [teamId, choices[teamId]!.codeLength])));
    }
    if (action.type === "debug-fill-clues" && current.phase === "clue") {
      const clues = { ...current.clues };
      codeInterceptTeamIds.forEach((teamId) => { clues[teamId] ??= Array.from({ length: codeLengthForTeam(current, teamId) }, (_, index) => `テスト${teamId === "red" ? "赤" : "青"}${index + 1}`); });
      return { ...current, clues, phase: "answer", phaseStartedAt: Date.now() };
    }
    if (action.type === "debug-fill-answers" && current.phase === "answer") {
      const allyAnswers = { ...current.allyAnswers };
      const interceptAnswers = { ...current.interceptAnswers };
      codeInterceptTeamIds.forEach((teamId) => {
        allyAnswers[teamId] ??= [...(current.secretCodes[teamId] ?? [])];
        if (current.roundNumber >= current.interceptionStartsAtRound) interceptAnswers[teamId] ??= [...(current.secretCodes[otherCodeInterceptTeam(teamId)] ?? [])];
      });
      return finishCodeInterceptRound({ ...current, allyAnswers, interceptAnswers });
    }
    return current;
  }, action.actorId, debugActionLabels[action.type]).catch(async (error) => {
    if (action.type === "join-room" && claim === "claimed") await clearActiveRoom(action.actorId, normalizedCode);
    throw error;
  });
  await redisCommand<number>(["SADD", roomIndexKey, room.code]);
  await saveActiveRooms(room);
  if (action.type === "leave-room") await clearActiveRoom(action.actorId, room.code);
  return room;
}

function parseStoredRoom(raw: string | null) {
  if (!raw) return null;
  try { return normalizeCodeInterceptRoom(JSON.parse(raw)); } catch { return null; }
}

export async function listJoinableCodeInterceptRooms(cursor?: unknown) {
  const page = await loadIndexedOnlineRoomPage(cursor, { indexKey: roomIndexKey, roomKey, parseRoom: parseStoredRoom, loadRoom: loadStoredCodeInterceptRoom });
  return {
    rooms: page.rooms.filter((room): room is CodeInterceptRoom => Boolean(room && room.phase === "lobby" && !isMultiplayerRoomExpired(room.updatedAt) && codeInterceptRoomHasSpace(room))).map(codeInterceptRoomChoice).sort((a, b) => b.updatedAt - a.updatedAt),
    nextCursor: page.nextCursor,
  };
}

export async function deleteStoredCodeInterceptRoom(code: string, actorId: string) {
  await dissolveIndexedOnlineRoom(code, actorId, dissolutionOptions);
}

export async function deleteHostedCodeInterceptRooms(_ownerId: string, authenticatedHostId: string) {
  return dissolveHostedIndexedOnlineRooms(authenticatedHostId, dissolutionOptions);
}

const dissolutionOptions = {
  gameId: "code-intercept" as const,
  roomIndexKey,
  roomKey,
  playerActiveRoomKey,
  errors: { forbidden: "CODE_INTERCEPT_ROOM_FORBIDDEN", inProgress: "CODE_INTERCEPT_ROOM_IN_PROGRESS" },
  loadRoom: loadStoredCodeInterceptRoom,
};
