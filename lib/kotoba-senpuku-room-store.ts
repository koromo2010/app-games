import { randomInt, randomUUID } from "node:crypto";
import {
  isValidKotobaSenpukuWord,
  isFullyRevealedKotobaSenpukuWord,
  kotobaSenpukuDebugWords,
  kotobaSenpukuKana,
  kotobaSenpukuKanaKey,
  maskKotobaSenpukuWord,
  minimumKotobaSenpukuWordLength,
  normalizeKotobaSenpukuConfig,
  normalizeKotobaSenpukuWord,
  nextKotobaSenpukuSurvivorIndex,
  pickKotobaSenpukuTheme,
  resolveKotobaSenpukuWinnerIds,
  type KotobaSenpukuPhase,
  type KotobaSenpukuEvent,
  type KotobaSenpukuPlayer,
  type KotobaSenpukuRoom,
  type KotobaSenpukuRoomAction,
  type KotobaSenpukuRoomChoice,
  type KotobaSenpukuRoundResult,
  type KotobaSenpukuTheme,
} from "@/lib/kotoba-senpuku";
import { isMultiplayerRoomExpired, multiplayerRoomExpiryArgs, multiplayerRoomTtlSeconds } from "@/lib/multiplayer-room-lifecycle";
import { recordKotobaSenpukuGameResults } from "@/lib/player-stats-store";
import { recordKotobaSenpukuReplay } from "@/lib/game-replay-store";
import { redisCommand } from "@/lib/redis-store";
import { commonGameTimeoutGraceMs } from "@/lib/game-timer/policy";
import { canDissolveOnlineRoom, canMoveFromOnlineRoom } from "@/lib/room-dissolve-policy";
import { claimPlayerActiveRoom, releasePlayerActiveRoom, type ActiveRoomClaim } from "@/lib/player-active-room";
import { normalizeOnlineRoomCode } from "@/lib/online-room-input";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";

const roomKeyPrefix = "kotoba-senpuku:room:";
const roomIndexKey = "kotoba-senpuku:rooms";
const playerActiveRoomKeyPrefix = "kotoba-senpuku:player-active-room:";

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function playerActiveRoomKey(playerId: string) {
  return `${playerActiveRoomKeyPrefix}${playerId}`;
}

function isPhase(value: unknown): value is KotobaSenpukuPhase {
  return value === "lobby" || value === "secret" || value === "battle" || value === "result";
}

function normalizePlayers(value: unknown): KotobaSenpukuPlayer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((player): player is KotobaSenpukuPlayer => Boolean(player?.id && player?.name))
    .map((player) => ({
      id: String(player.id).slice(0, 80),
      name: String(player.name).trim().slice(0, 20),
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
      isDummy: player.isDummy === true,
    }));
}

function normalizeTheme(value: unknown): KotobaSenpukuTheme | null {
  if (!value || typeof value !== "object") return null;
  const theme = value as Partial<KotobaSenpukuTheme>;
  if (!theme.id || !theme.title || !theme.guide) return null;
  return { id: String(theme.id), title: String(theme.title), guide: String(theme.guide) };
}

function normalizeStringRecord(value: unknown, playerIds: Set<string>, wordsOnly = false) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([id, item]) => {
    if (!playerIds.has(id) || typeof item !== "string") return [];
    const text = wordsOnly ? normalizeKotobaSenpukuWord(item) : item;
    if (wordsOnly && !isValidKotobaSenpukuWord(text)) return [];
    return [[id, text]];
  }));
}

function normalizeNumberRecord(value: unknown, playerIds: Set<string>) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries([...playerIds].map((id) => {
    const number = source[id];
    return [id, typeof number === "number" && Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0];
  }));
}

function normalizeHistory(value: unknown): KotobaSenpukuRoundResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const result = item as Partial<KotobaSenpukuRoundResult>;
    const theme = normalizeTheme(result.theme);
    if (!theme || !result.secrets || typeof result.secrets !== "object") return [];
    const ids = new Set(Object.keys(result.secrets));
    return [{
      round: typeof result.round === "number" ? Math.max(1, Math.floor(result.round)) : 1,
      theme,
      secrets: normalizeStringRecord(result.secrets, ids, true),
      signals: normalizeNumberRecord(result.signals, ids),
      survivalBonus: normalizeNumberRecord(result.survivalBonus, ids),
      calledKana: Array.isArray(result.calledKana) ? result.calledKana.filter((kana): kana is string => kotobaSenpukuKana.includes(kana as (typeof kotobaSenpukuKana)[number])) : [],
      events: normalizeEvents(result.events, ids),
      eliminatedIds: Array.isArray(result.eliminatedIds) ? result.eliminatedIds.filter((id): id is string => typeof id === "string" && ids.has(id)) : [],
      winnerId: typeof result.winnerId === "string" && ids.has(result.winnerId) ? result.winnerId : null,
      winnerIds: Array.isArray(result.winnerIds) ? result.winnerIds.filter((id): id is string => typeof id === "string" && ids.has(id)) : typeof result.winnerId === "string" && ids.has(result.winnerId) ? [result.winnerId] : [],
    }];
  });
}

function normalizeEvents(value: unknown, playerIds: Set<string>): KotobaSenpukuEvent[] {
  if (!Array.isArray(value)) return [];
  const events: KotobaSenpukuEvent[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const event = item as Partial<KotobaSenpukuEvent> & { type?: unknown };
    if (!playerIds.has(String(event.actorId))) continue;
    const base = {
      turn: typeof event.turn === "number" ? Math.max(1, Math.floor(event.turn)) : 1,
      actorId: String(event.actorId),
      createdAt: typeof event.createdAt === "number" ? event.createdAt : Date.now(),
    };
    if (event.type === "scan" && typeof event.kana === "string" && kotobaSenpukuKana.includes(event.kana as (typeof kotobaSenpukuKana)[number])) {
      events.push({ ...base, type: "scan", kana: event.kana, hitIds: Array.isArray(event.hitIds) ? event.hitIds.filter((id): id is string => typeof id === "string" && playerIds.has(id)) : [], eliminatedIds: Array.isArray(event.eliminatedIds) ? event.eliminatedIds.filter((id): id is string => typeof id === "string" && playerIds.has(id)) : [] });
      continue;
    }
    if (event.type === "challenge" && typeof event.targetId === "string" && playerIds.has(event.targetId) && typeof event.guess === "string") {
      events.push({ ...base, type: "challenge", targetId: event.targetId, guess: normalizeKotobaSenpukuWord(event.guess), correct: event.correct === true, eliminatedIds: Array.isArray(event.eliminatedIds) ? event.eliminatedIds.filter((id): id is string => typeof id === "string" && playerIds.has(id)) : [] });
      continue;
    }
    if (event.type === "timeout") events.push({ ...base, type: "timeout" });
  }
  return events.slice(-300);
}

function normalizeRoom(value: unknown): KotobaSenpukuRoom | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<KotobaSenpukuRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  const players = normalizePlayers(parsed.players);
  if (!code || !hostId || players.length === 0 || !players.some((player) => player.id === hostId)) return null;
  const playerIds = new Set(players.map((player) => player.id));
  const config = normalizeKotobaSenpukuConfig(parsed);
  const calledKana = Array.isArray(parsed.calledKana)
    ? [...new Set(parsed.calledKana.filter((kana): kana is string => kotobaSenpukuKana.includes(kana as (typeof kotobaSenpukuKana)[number])))]
    : [];
  return {
    code,
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, 40) : "",
    phase: isPhase(parsed.phase) ? parsed.phase : "lobby",
    players,
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : 1,
    ...config,
    debugReplayEnabled: parsed.debugReplayEnabled === true && config.debugMode,
    round: typeof parsed.round === "number" ? Math.max(1, Math.floor(parsed.round)) : 1,
    theme: normalizeTheme(parsed.theme),
    secrets: normalizeStringRecord(parsed.secrets, playerIds, true),
    submittedIds: Array.isArray(parsed.submittedIds) ? parsed.submittedIds.filter((id): id is string => typeof id === "string" && playerIds.has(id)) : [],
    masks: normalizeStringRecord(parsed.masks, playerIds),
    calledKana,
    exposedIds: Array.isArray(parsed.exposedIds) ? parsed.exposedIds.filter((id): id is string => typeof id === "string" && playerIds.has(id)) : [],
    roundSignals: normalizeNumberRecord(parsed.roundSignals, playerIds),
    totalScores: normalizeNumberRecord(parsed.totalScores, playerIds),
    activePlayerIndex: typeof parsed.activePlayerIndex === "number" ? Math.max(0, Math.min(players.length - 1, Math.floor(parsed.activePlayerIndex))) : 0,
    turnNumber: typeof parsed.turnNumber === "number" ? Math.max(1, Math.floor(parsed.turnNumber)) : 1,
    roundEvents: normalizeEvents(parsed.roundEvents, playerIds),
    history: normalizeHistory(parsed.history),
    log: Array.isArray(parsed.log) ? parsed.log.filter((entry): entry is string => typeof entry === "string").slice(0, 30) : [],
    phaseStartedAt: typeof parsed.phaseStartedAt === "number" ? parsed.phaseStartedAt : null,
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

function timedOut(room: KotobaSenpukuRoom, seconds: number, now = Date.now()) {
  return Boolean(room.phaseStartedAt && seconds > 0 && now >= room.phaseStartedAt + seconds * 1000 + commonGameTimeoutGraceMs());
}

function addLog(room: KotobaSenpukuRoom, message: string) {
  return { ...room, log: [message, ...room.log].slice(0, 30) };
}

function fillMissingSecrets(room: KotobaSenpukuRoom) {
  const themeId = room.theme?.id ?? "meal";
  const candidates = kotobaSenpukuDebugWords[themeId] ?? kotobaSenpukuDebugWords.meal;
  const used = new Set(Object.values(room.secrets));
  const secrets = { ...room.secrets };
  let cursor = 0;
  for (const player of room.players) {
    if (secrets[player.id]) continue;
    while (cursor < candidates.length && used.has(candidates[cursor])) cursor += 1;
    const word = candidates[cursor] ?? `ことば${cursor + 1}`;
    secrets[player.id] = word;
    used.add(word);
    cursor += 1;
  }
  return { ...room, secrets, submittedIds: room.players.map((player) => player.id) };
}

function allSecretsSubmitted(room: KotobaSenpukuRoom) {
  return room.players.every((player) => Boolean(room.secrets[player.id]));
}

function beginBattle(room: KotobaSenpukuRoom) {
  const masks = Object.fromEntries(room.players.map((player) => [player.id, maskKotobaSenpukuWord(room.secrets[player.id] ?? "", [])]));
  const activePlayerIndex = room.randomFirstTurn && room.players.length > 0 ? randomInt(room.players.length) : 0;
  const activePlayer = room.players[activePlayerIndex];
  return addLog({
    ...room,
    phase: "battle",
    masks,
    calledKana: [],
    exposedIds: [],
    activePlayerIndex,
    turnNumber: 1,
    roundEvents: [],
    phaseStartedAt: Date.now(),
  }, room.randomFirstTurn
    ? `最初の手番は、抽選で${activePlayer?.name ?? "最初のプレイヤー"}に決まりました。`
    : `最初の手番は${activePlayer?.name ?? "最初のプレイヤー"}です。参加順に進行します。`);
}

function beginRound(room: KotobaSenpukuRoom, round: number) {
  return {
    ...room,
    phase: "secret" as const,
    round,
    theme: pickKotobaSenpukuTheme(room.history),
    secrets: {},
    submittedIds: [],
    masks: {},
    calledKana: [],
    exposedIds: [],
    roundSignals: Object.fromEntries(room.players.map((player) => [player.id, 0])),
    activePlayerIndex: 0,
    turnNumber: 1,
    log: [`第${round}ラウンドを開始します。秘密語を入力してください。`, ...room.log].slice(0, 30),
    phaseStartedAt: Date.now(),
  };
}

function advanceTurn(room: KotobaSenpukuRoom, message: string) {
  const activePlayerIndex = nextKotobaSenpukuSurvivorIndex(room.players.map((player) => player.id), room.exposedIds, room.activePlayerIndex);
  const next = room.players[activePlayerIndex];
  return addLog({
    ...room,
    activePlayerIndex,
    turnNumber: room.turnNumber + 1,
    phaseStartedAt: Date.now(),
  }, `${message} 次の手番は${next?.name ?? "次のプレイヤー"}です。`);
}

function finishRound(room: KotobaSenpukuRoom, simultaneousEliminatedIds: string[] = []) {
  const winnerIds = resolveKotobaSenpukuWinnerIds(room.players.map((player) => player.id), room.exposedIds, simultaneousEliminatedIds, room.secrets);
  const winnerId = winnerIds.length === 1 ? winnerIds[0] : null;
  const survivalBonus = Object.fromEntries(room.players.map((player) => [player.id, winnerIds.includes(player.id) ? 3 : 0]));
  const signals = Object.fromEntries(room.players.map((player) => [player.id, (room.roundSignals[player.id] ?? 0) + survivalBonus[player.id]]));
  const totalScores = Object.fromEntries(room.players.map((player) => [player.id, (room.totalScores[player.id] ?? 0) + signals[player.id]]));
  const result: KotobaSenpukuRoundResult = {
    round: room.round,
    theme: room.theme ?? pickKotobaSenpukuTheme(room.history),
    secrets: { ...room.secrets },
    signals,
    survivalBonus,
    calledKana: [...room.calledKana],
    events: [...room.roundEvents],
    eliminatedIds: [...room.exposedIds],
    winnerId,
    winnerIds,
  };
  return addLog({
    ...room,
    phase: "result",
    roundSignals: signals,
    totalScores,
    history: [...room.history.filter((item) => item.round !== room.round), result],
    masks: Object.fromEntries(room.players.map((player) => [player.id, room.secrets[player.id] ?? ""])),
    phaseStartedAt: null,
  }, winnerIds.length === 1
    ? `${room.players.find((player) => player.id === winnerIds[0])?.name ?? "最後の1人"}の勝利です。`
    : winnerIds.length > 1
      ? `${winnerIds.map((id) => room.players.find((player) => player.id === id)?.name).filter(Boolean).join("、")}の同率勝利です。`
      : "勝者なしで終了しました。");
}

function shouldFinishRound(room: KotobaSenpukuRoom) {
  const hiddenCount = room.players.filter((player) => !room.exposedIds.includes(player.id)).length;
  return hiddenCount <= 1;
}

function performScan(room: KotobaSenpukuRoom, kana: string) {
  const actor = room.players[room.activePlayerIndex];
  if (!actor || room.calledKana.includes(kana)) return room;
  const calledKana = [...room.calledKana, kana];
  const hitTargets = room.players.filter((player) => (
    !room.exposedIds.includes(player.id)
    && [...(room.secrets[player.id] ?? "")].some((character) => kotobaSenpukuKanaKey(character) === kana)
  ));
  const masks = Object.fromEntries(room.players.map((player) => [
    player.id,
    maskKotobaSenpukuWord(room.secrets[player.id] ?? "", calledKana, room.exposedIds.includes(player.id)),
  ]));
  const newlyExposed = room.players.filter((player) => !room.exposedIds.includes(player.id) && isFullyRevealedKotobaSenpukuWord(room.secrets[player.id] ?? "", calledKana));
  const exposedIds = [...new Set([...room.exposedIds, ...newlyExposed.map((player) => player.id)])];
  const eliminatedNames = newlyExposed.map((player) => player.name).join("、");
  const message = hitTargets.length
    ? `${actor.name}が「${kana}」を探知。${hitTargets.length}人に命中しました。${eliminatedNames ? `${eliminatedNames}が脱落しました。` : ""}`
    : `${actor.name}が「${kana}」を探知。誰にも命中しませんでした。`;
  const event: KotobaSenpukuEvent = { type: "scan", turn: room.turnNumber, actorId: actor.id, kana, hitIds: hitTargets.map((player) => player.id), eliminatedIds: newlyExposed.map((player) => player.id), createdAt: Date.now() };
  const changed = addLog({ ...room, calledKana, masks, exposedIds, roundEvents: [...room.roundEvents, event].slice(-300) }, message);
  if (shouldFinishRound(changed)) return finishRound(changed, newlyExposed.map((player) => player.id));
  if (hitTargets.length > 0 && room.continuousScan && !exposedIds.includes(actor.id)) return addLog({ ...changed, phaseStartedAt: Date.now() }, `命中したため、${actor.name}は続けて行動します。`);
  const turnEndMessage = exposedIds.includes(actor.id)
    ? `${actor.name}が脱落したため、手番を終了します。`
    : hitTargets.length > 0
      ? "連続探知なしの設定のため、手番を終了します。"
      : "誰にも命中しなかったため、手番を終了します。";
  return advanceTurn(changed, turnEndMessage);
}

function performChallenge(room: KotobaSenpukuRoom, targetId: string, guessInput: string) {
  const actor = room.players[room.activePlayerIndex];
  const target = room.players.find((player) => player.id === targetId);
  if (!actor || !target || target.id === actor.id || room.exposedIds.includes(target.id)) return room;
  const guess = normalizeKotobaSenpukuWord(guessInput);
  const correct = guess === room.secrets[target.id];
  const exposedIds = correct ? [...new Set([...room.exposedIds, target.id])] : room.exposedIds;
  const masks = correct ? { ...room.masks, [target.id]: room.secrets[target.id] } : room.masks;
  const event: KotobaSenpukuEvent = { type: "challenge", turn: room.turnNumber, actorId: actor.id, targetId: target.id, guess, correct, eliminatedIds: correct ? [target.id] : [], createdAt: Date.now() };
  const changed = addLog({ ...room, exposedIds, masks, roundEvents: [...room.roundEvents, event].slice(-300) }, correct
    ? `${actor.name}が${target.name}の秘密語を「${guess}」と回答。正解したため、${target.name}が脱落しました。`
    : `${actor.name}が${target.name}の秘密語を「${guess}」と回答しましたが、不正解でした。`);
  return shouldFinishRound(changed) ? finishRound(changed) : advanceTurn(changed, "秘密語を回答したため、手番を終了します。");
}

function reconcileProgress(room: KotobaSenpukuRoom) {
  if (room.phase === "secret" && (allSecretsSubmitted(room) || timedOut(room, room.secretTimeLimitSeconds))) {
    return beginBattle(allSecretsSubmitted(room) ? room : fillMissingSecrets(room));
  }
  if (room.phase === "battle" && timedOut(room, room.turnTimeLimitSeconds)) {
    const player = room.players[room.activePlayerIndex];
    const changed = player ? { ...room, roundEvents: [...room.roundEvents, { type: "timeout" as const, turn: room.turnNumber, actorId: player.id, createdAt: Date.now() }].slice(-300) } : room;
    return advanceTurn(changed, `${player?.name ?? "手番プレイヤー"}は時間切れのため、手番を終了します。`);
  }
  return room;
}

async function compareAndSetRoom(expectedRevision: number, room: KotobaSenpukuRoom) {
  return redisCommand<number>([
    "EVAL",
    "local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end; local current=cjson.decode(raw); if tonumber(current.revision or 0)~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1",
    "1",
    roomKey(room.code),
    String(expectedRevision),
    JSON.stringify(room),
    String(multiplayerRoomTtlSeconds),
  ]);
}

async function mutateStoredRoom(code: string, mutate: (room: KotobaSenpukuRoom) => KotobaSenpukuRoom) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await loadStoredKotobaSenpukuRoom(code);
    if (!current) throw new Error("KOTOBA_SENPUKU_ROOM_NOT_FOUND");
    const changed = mutate(current);
    if (changed === current) return current;
    const next = normalizeRoom({ ...changed, revision: current.revision + 1, updatedAt: Date.now() });
    if (!next) throw new Error("INVALID_KOTOBA_SENPUKU_ROOM");
    const saved = await compareAndSetRoom(current.revision, next);
    if (saved === 1) {
      await Promise.all([recordKotobaSenpukuGameResults(next), recordKotobaSenpukuReplay(next)]);
      return next;
    }
    if (saved === -1) throw new Error("KOTOBA_SENPUKU_ROOM_NOT_FOUND");
  }
  throw new Error("KOTOBA_SENPUKU_ROOM_CONFLICT");
}

function makeChoice(room: KotobaSenpukuRoom): KotobaSenpukuRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "不明",
    playerCount: room.players.length,
    roundsTotal: room.roundsTotal,
    hasPassphrase: Boolean(room.passphrase),
    updatedAt: room.updatedAt,
  };
}

async function saveActiveRooms(room: KotobaSenpukuRoom) {
  await Promise.all(room.players.filter((player) => !player.isDummy).map((player) => (
    redisCommand<"OK">(["SET", playerActiveRoomKey(player.id), room.code, ...multiplayerRoomExpiryArgs()])
  )));
}

async function clearActiveRoom(playerId: string, code: string) {
  const saved = await redisCommand<string | null>(["GET", playerActiveRoomKey(playerId)]);
  if (saved?.trim().toUpperCase() === code.trim().toUpperCase()) await redisCommand<number>(["DEL", playerActiveRoomKey(playerId)]);
}

export function sanitizeKotobaSenpukuRoom(room: KotobaSenpukuRoom, playerId: string) {
  const revealAll = room.phase === "result" || (room.debugMode && playerId === room.hostId);
  const secrets = revealAll
    ? room.secrets
    : room.secrets[playerId] ? { [playerId]: room.secrets[playerId] } : {};
  return { ...room, passphrase: room.passphrase ? "設定済み" : "", secrets };
}

export async function loadStoredKotobaSenpukuRoom(code: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
  if (!raw) return null;
  try {
    const room = normalizeRoom(JSON.parse(raw));
    if (!room) return null;
    if (isMultiplayerRoomExpired(room.updatedAt)) {
      await redisCommand<number>(["DEL", roomKey(room.code)]);
      await redisCommand<number>(["SREM", roomIndexKey, room.code]);
      await Promise.all(room.players.map((player) => clearActiveRoom(player.id, room.code)));
      return null;
    }
    return room;
  } catch {
    return null;
  }
}

export async function loadAndReconcileKotobaSenpukuRoom(code: string) {
  const room = await loadStoredKotobaSenpukuRoom(code);
  if (!room) return null;
  if (reconcileProgress(room) === room) {
    await Promise.all([recordKotobaSenpukuGameResults(room), recordKotobaSenpukuReplay(room)]);
    return room;
  }
  return mutateStoredRoom(code, reconcileProgress);
}

export async function loadKotobaSenpukuPlayerActiveRoom(playerId: string) {
  const normalizedId = playerId.trim();
  if (!normalizedId) return null;
  const code = await redisCommand<string | null>(["GET", playerActiveRoomKey(normalizedId)]);
  if (!code) return null;
  const room = await loadAndReconcileKotobaSenpukuRoom(code);
  if (!room || !room.players.some((player) => player.id === normalizedId)) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(normalizedId)]);
    return null;
  }
  return room;
}

export async function createStoredKotobaSenpukuRoom(value: unknown, actorId: string) {
  const room = normalizeRoom(value);
  if (!room || actorId !== room.hostId) throw new Error("INVALID_KOTOBA_SENPUKU_ROOM");
  const created = { ...room, revision: 0, gameNumber: 1, phase: "lobby" as const, debugMode: false, debugReplayEnabled: false, theme: null, secrets: {}, submittedIds: [], masks: {}, calledKana: [], exposedIds: [], roundEvents: [], history: [], log: ["参加者を待っています。"], phaseStartedAt: null, updatedAt: Date.now() };
  const activeRoom = await loadKotobaSenpukuPlayerActiveRoom(actorId);
  if (activeRoom && activeRoom.code !== created.code) {
    if (!canMoveFromOnlineRoom("kotoba-senpuku", activeRoom)) throw new Error("KOTOBA_SENPUKU_PLAYER_ALREADY_ACTIVE");
    await releasePlayerActiveRoom(playerActiveRoomKey(actorId), activeRoom.code);
  }
  const claim = await claimPlayerActiveRoom(playerActiveRoomKey(actorId), created.code);
  if (!claim) throw new Error("KOTOBA_SENPUKU_PLAYER_ALREADY_ACTIVE");
  try {
    const saved = await redisCommand<"OK" | null>(["SET", roomKey(created.code), JSON.stringify(created), "NX", ...multiplayerRoomExpiryArgs()]);
    if (saved !== "OK") throw new Error("KOTOBA_SENPUKU_ROOM_CONFLICT");
    await redisCommand<number>(["SADD", roomIndexKey, created.code]);
    await saveActiveRooms(created);
    return created;
  } catch (error) {
    if (claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(actorId), created.code);
    throw error;
  }
}

export async function applyStoredKotobaSenpukuAction(code: string, action: KotobaSenpukuRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  if (action.type === "join-room") {
    const activeRoom = await loadKotobaSenpukuPlayerActiveRoom(action.actorId);
    if (activeRoom && activeRoom.code !== code.trim().toUpperCase()) {
      if (!canMoveFromOnlineRoom("kotoba-senpuku", activeRoom)) throw new Error("KOTOBA_SENPUKU_PLAYER_ALREADY_ACTIVE");
      await releasePlayerActiveRoom(playerActiveRoomKey(action.actorId), activeRoom.code);
    }
    claim = await claimPlayerActiveRoom(playerActiveRoomKey(action.actorId), code.trim().toUpperCase());
    if (!claim) throw new Error("KOTOBA_SENPUKU_PLAYER_ALREADY_ACTIVE");
  }
  const room = await mutateStoredRoom(code, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("KOTOBA_SENPUKU_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return current;
      return addLog({ ...current, players: [...current.players, action.player] }, `${action.player.name}さんが参加しました。`);
    }

    const actorIsHost = action.actorId === current.hostId;
    const actorIsMember = current.players.some((player) => player.id === action.actorId && !player.isDummy);
    if (!actorIsMember) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
    if (action.type === "abort-game") {
      if (!actorIsHost || !current.debugMode || current.phase === "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, phase: "lobby", round: 1, debugReplayEnabled: false, theme: null, secrets: {}, submittedIds: [], masks: {}, calledKana: [], exposedIds: [], roundEvents: [], roundSignals: {}, totalScores: {}, activePlayerIndex: 0, turnNumber: 1, history: [], log: ["ゲームを中断し、ゲーム開始前へ戻りました。"], phaseStartedAt: null };
    }

    const reconciled = reconcileProgress(current);
    if (reconciled !== current) return reconciled;

    if (action.type === "leave-room") {
      if (actorIsHost || current.phase !== "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.actorId) };
    }
    if (action.type === "update-config") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, ...normalizeKotobaSenpukuConfig({ ...action.config, debugMode: current.debugMode }) };
    }
    if (action.type === "set-debug") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, debugMode: action.enabled, debugReplayEnabled: action.enabled ? current.debugReplayEnabled : false, players: action.enabled ? current.players : current.players.filter((player) => !player.isDummy) };
    }
    if (action.type === "set-debug-replay") {
      if (!actorIsHost || !current.debugMode) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "debug-add-player") {
      if (!actorIsHost || !current.debugMode || current.phase !== "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      const dummyNumber = current.players.filter((player) => player.isDummy).length + 1;
      const colors = ["#38bdf8", "#a78bfa", "#f472b6", "#f59e0b", "#84cc16", "#14b8a6", "#fb7185"];
      return { ...current, players: [...current.players, { id: `dummy-${randomUUID()}`, name: `ダミー${dummyNumber}`, joinedAt: Date.now(), avatarColor: colors[(dummyNumber - 1) % colors.length], isDummy: true }] };
    }
    if (action.type === "start-game") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      if (current.players.length < 2) throw new Error("KOTOBA_SENPUKU_NOT_ENOUGH_PLAYERS");
      return beginRound({ ...current, round: 1, history: [], totalScores: Object.fromEntries(current.players.map((player) => [player.id, 0])) }, 1);
    }
    if (action.type === "submit-secret") {
      if (current.phase !== "secret" || action.round !== current.round || current.secrets[action.actorId]) return current;
      const word = normalizeKotobaSenpukuWord(action.word);
      if (!isValidKotobaSenpukuWord(word)) throw new Error("KOTOBA_SENPUKU_INVALID_WORD");
      if ([...word].length < minimumKotobaSenpukuWordLength(current.players.length)) throw new Error("KOTOBA_SENPUKU_WORD_TOO_SHORT");
      return reconcileProgress({ ...current, secrets: { ...current.secrets, [action.actorId]: word }, submittedIds: [...new Set([...current.submittedIds, action.actorId])] });
    }
    if (action.type === "debug-fill-secrets") {
      if (!actorIsHost || !current.debugMode || current.phase !== "secret" || action.round !== current.round) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return beginBattle(fillMissingSecrets(current));
    }
    if (action.type === "next-round") {
      if (!actorIsHost || current.phase !== "result" || action.round !== current.round || current.round >= current.roundsTotal) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return beginRound(current, current.round + 1);
    }
    if (action.type === "reset-game") {
      if (!actorIsHost || current.phase !== "result" || current.round < current.roundsTotal) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      return { ...current, gameNumber: current.gameNumber + 1, phase: "lobby", round: 1, debugReplayEnabled: false, theme: null, secrets: {}, submittedIds: [], masks: {}, calledKana: [], exposedIds: [], roundEvents: [], roundSignals: {}, totalScores: {}, activePlayerIndex: 0, turnNumber: 1, history: [], log: ["同じ部屋で次のゲームを準備できます。"], phaseStartedAt: null };
    }

    const activePlayer = current.players[current.activePlayerIndex];
    const canControlTurn = activePlayer?.id === action.actorId || (current.debugMode && actorIsHost);
    if (current.phase !== "battle" || action.round !== current.round || !canControlTurn) throw new Error("KOTOBA_SENPUKU_NOT_YOUR_TURN");
    if (action.type === "scan-kana") {
      if (!kotobaSenpukuKana.includes(action.kana as (typeof kotobaSenpukuKana)[number]) || current.calledKana.includes(action.kana)) throw new Error("KOTOBA_SENPUKU_INVALID_KANA");
      return performScan(current, action.kana);
    }
    if (action.type === "challenge-word") {
      if (!current.allowWordGuess) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      if (!isValidKotobaSenpukuWord(action.guess)) throw new Error("KOTOBA_SENPUKU_INVALID_WORD");
      const target = current.players.find((player) => player.id === action.targetId);
      if (!target || target.id === activePlayer.id || current.exposedIds.includes(target.id)) throw new Error("KOTOBA_SENPUKU_INVALID_TARGET");
      return performChallenge(current, target.id, action.guess);
    }
    if (action.type === "debug-auto-turn") {
      if (!actorIsHost || !current.debugMode) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
      const candidate = current.players
        .filter((player) => player.id !== activePlayer.id && !current.exposedIds.includes(player.id))
        .flatMap((player) => [...(current.secrets[player.id] ?? "")].map(kotobaSenpukuKanaKey))
        .find((kana) => kotobaSenpukuKana.includes(kana as (typeof kotobaSenpukuKana)[number]) && !current.calledKana.includes(kana));
      const kana = candidate ?? kotobaSenpukuKana.find((item) => !current.calledKana.includes(item));
      return kana ? performScan(current, kana) : finishRound(current);
    }
    return current;
  }).catch(async (error) => {
    if (action.type === "join-room" && claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(action.actorId), code);
    throw error;
  });
  await redisCommand<number>(["SADD", roomIndexKey, room.code]);
  await saveActiveRooms(room);
  if (action.type === "leave-room") await clearActiveRoom(action.actorId, room.code);
  return room;
}

export async function listJoinableKotobaSenpukuRooms() {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredKotobaSenpukuRoom(code)));
  const missingCodes = codes.filter((_, index) => !rooms[index]);
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
  return rooms.filter((room): room is KotobaSenpukuRoom => Boolean(room && room.phase === "lobby")).map(makeChoice).sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function deleteStoredKotobaSenpukuRoom(code: string, actorId: string) {
  const room = await loadStoredKotobaSenpukuRoom(code);
  if (!room) return;
  if (room.hostId !== actorId) throw new Error("KOTOBA_SENPUKU_ROOM_FORBIDDEN");
  if (!canDissolveOnlineRoom("kotoba-senpuku", room)) throw new Error("KOTOBA_SENPUKU_ROOM_IN_PROGRESS");
  await redisCommand<number>(["DEL", roomKey(code)]);
  await redisCommand<number>(["SREM", roomIndexKey, room.code]);
  await Promise.all(room.players.map((player) => clearActiveRoom(player.id, room.code)));
}

export async function deleteHostedKotobaSenpukuRooms(_ownerId: string, authenticatedHostId: string) {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredKotobaSenpukuRoom(code)));
  const targets = rooms.filter((room): room is KotobaSenpukuRoom => Boolean(room && room.hostId === authenticatedHostId));
  if (targets.some((room) => !canDissolveOnlineRoom("kotoba-senpuku", room))) throw new Error("KOTOBA_SENPUKU_ROOM_IN_PROGRESS");
  await Promise.all(targets.map((room) => deleteStoredKotobaSenpukuRoom(room.code, room.hostId)));
  return targets.length;
}
