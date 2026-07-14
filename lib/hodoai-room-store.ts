import { redisCommand } from "@/lib/redis-store";
import { recordHodoaiGameResults } from "@/lib/player-stats-store";
import { recordHodoaiReplay } from "@/lib/game-replay-store";
import { isMultiplayerRoomExpired, multiplayerRoomExpiryArgs, multiplayerRoomTtlSeconds } from "@/lib/multiplayer-room-lifecycle";
import { randomUUID } from "node:crypto";
import { commonGameTimeoutGraceMs } from "@/lib/game-timer/policy";
import { canDissolveOnlineRoom, canMoveFromOnlineRoom } from "@/lib/room-dissolve-policy";
import { claimPlayerActiveRoom, releasePlayerActiveRoom, type ActiveRoomClaim } from "@/lib/player-active-room";
import { normalizeOnlineRoomCode } from "@/lib/online-room-input";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";
import { appendGameDebugLog, normalizeGameDebugLog } from "@/lib/game-debug-log";
import { loadOnlineRoomValues, scanOnlineRoomCodes } from "@/lib/online-room-list";
import { normalizePlayerTimeoutFields, playerTimeLimitSeconds, recordPlayerActivity, recordPlayerTimeout, recoverPlayerTimeout } from "@/lib/player-timeout-policy";
import {
  clueHasNumber,
  canAssignHodoaiSorter,
  canReorderHodoaiCards,
  countHodoaiInversions,
  dealHodoaiCards,
  hodoaiThemes,
  hodoaiClueRoundDestination,
  hodoaiTechnicalPlayerLimit,
  normalizeHodoaiConfig,
  pickHodoaiTheme,
  pointsForInversions,
  shuffleHodoai,
  type HodoaiPhase,
  type HodoaiCard,
  type HodoaiClueRound,
  type HodoaiPlayer,
  type HodoaiRoom,
  type HodoaiRoomAction,
  type HodoaiRoomChoice,
  type HodoaiRoundResult,
  type HodoaiTheme,
} from "@/lib/hodoai-talk";

const roomKeyPrefix = "hodoai:room:";
const roomIndexKey = "hodoai:rooms";
const playerActiveRoomKeyPrefix = "hodoai:player-active-room:";

const hodoaiDebugActionLabels: Record<HodoaiRoomAction["type"], string> = {
  "join-room": "部屋に参加",
  "leave-room": "部屋から退出",
  "recover-player": "通常の持ち時間に復帰",
  "update-config": "部屋設定を変更",
  "set-sorter": "並べ替え役を変更",
  "set-debug": "デバッグモードを変更",
  "set-debug-replay": "プレイバック記録設定を変更",
  "start-game": "ゲームを開始",
  "submit-clue": "ヒントを提出",
  reorder: "ヒントの順番を変更",
  "score-round": "最終並びを採点",
  "reset-game": "同じ部屋で再戦準備",
  "abort-game": "ゲームを中断",
  "debug-fill-clues": "未提出ヒントを自動入力",
  "debug-sort": "正解順に並べ替え",
  "debug-add-player": "ダミープレイヤーを追加",
};

function roomKey(code: string) {
  return `${roomKeyPrefix}${code.trim().toUpperCase()}`;
}

function playerActiveRoomKey(playerId: string) {
  return `${playerActiveRoomKeyPrefix}${playerId}`;
}

function isPhase(value: unknown): value is HodoaiPhase {
  return value === "lobby" || value === "clue" || value === "arrange" || value === "result";
}

function normalizePlayers(value: unknown): HodoaiPlayer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((player): player is HodoaiPlayer => Boolean(player?.id && player?.name))
    .slice(0, hodoaiTechnicalPlayerLimit)
    .map((player) => ({
      id: String(player.id).slice(0, 80),
      name: String(player.name).trim().slice(0, 20),
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
      isDummy: player.isDummy === true,
      shareNameAllowed: player.shareNameAllowed === true,
    }));
}

function normalizeStringRecord(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => key && typeof item === "string")
      .map(([key, item]) => [key, String(item).slice(0, 60)]),
  );
}

function normalizeNumberRecord(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => key && typeof item === "number" && Number.isFinite(item))
      .map(([key, item]) => [key, Math.max(0, Math.min(120, Math.floor(item as number)))]),
  );
}

function normalizeTheme(value: unknown): HodoaiTheme | null {
  if (!value || typeof value !== "object") return null;
  const theme = value as Partial<HodoaiTheme>;
  if (!theme.id || !theme.title || !theme.lowLabel || !theme.highLabel) return null;
  return { id: theme.id, title: theme.title, lowLabel: theme.lowLabel, highLabel: theme.highLabel };
}

function normalizeClueRounds(value: unknown): HodoaiClueRound[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const clueRound = item as Partial<HodoaiClueRound>;
    const theme = normalizeTheme(clueRound.theme);
    if (!theme) return [];
    return [{
      round: typeof clueRound.round === "number" ? Math.max(1, Math.floor(clueRound.round)) : 1,
      theme,
      clues: normalizeStringRecord(clueRound.clues),
    }];
  }).slice(0, 4);
}

function cardOwnerFromId(id: string, players: HodoaiPlayer[]) {
  return players.find((player) => id === player.id || id.startsWith(`${player.id}:card-`))?.id ?? "";
}

function normalizeCards(value: unknown, players: HodoaiPlayer[], fallbackIds: string[] = []): HodoaiCard[] {
  const playerIds = new Set(players.map((player) => player.id));
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const card = item as Partial<HodoaiCard>;
      if (typeof card.id !== "string" || typeof card.ownerId !== "string" || !playerIds.has(card.ownerId)) return [];
      return [{ id: card.id.slice(0, 120), ownerId: card.ownerId, cardNumber: typeof card.cardNumber === "number" ? Math.max(1, Math.floor(card.cardNumber)) : 1 }];
    }).slice(0, 121);
  }
  const ownerCounts = new Map<string, number>();
  return fallbackIds.flatMap((id) => {
    const ownerId = cardOwnerFromId(id, players);
    if (!ownerId) return [];
    const cardNumber = (ownerCounts.get(ownerId) ?? 0) + 1;
    ownerCounts.set(ownerId, cardNumber);
    return [{ id, ownerId, cardNumber }];
  });
}

function normalizeHistory(value: unknown, players: HodoaiPlayer[]): HodoaiRoundResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const result = item as Partial<HodoaiRoundResult>;
    const theme = normalizeTheme(result.theme);
    if (!theme) return [];
    const order = Array.isArray(result.order) ? result.order.filter((id): id is string => typeof id === "string") : [];
    const normalizedClueRounds = normalizeClueRounds(result.clueRounds);
    return [{
      round: typeof result.round === "number" ? Math.max(1, Math.floor(result.round)) : 1,
      theme,
      inversions: typeof result.inversions === "number" ? Math.max(0, Math.floor(result.inversions)) : 0,
      points: typeof result.points === "number" ? Math.max(0, Math.min(3, Math.floor(result.points))) : 0,
      cards: normalizeCards(result.cards, players, order),
      clueRounds: normalizedClueRounds.length > 0
        ? normalizedClueRounds
        : [{ round: typeof result.round === "number" ? Math.max(1, Math.floor(result.round)) : 1, theme, clues: normalizeStringRecord(result.clues) }],
      order,
      values: normalizeNumberRecord(result.values),
      clues: normalizeStringRecord(result.clues),
    }];
  });
}

function normalizeRoom(value: unknown): HodoaiRoom | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<HodoaiRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  const players = normalizePlayers(parsed.players);
  if (!code || !hostId || players.length === 0 || !players.some((player) => player.id === hostId)) return null;
  const sorterId = typeof parsed.sorterId === "string" && players.some((player) => player.id === parsed.sorterId)
    ? parsed.sorterId
    : hostId;
  const config = normalizeHodoaiConfig(parsed);
  const history = normalizeHistory(parsed.history, players);
  const theme = normalizeTheme(parsed.theme);
  const clues = normalizeStringRecord(parsed.clues);
  const storedClueHistory = normalizeClueRounds(parsed.clueHistory);
  const clueHistory = storedClueHistory.length > 0
    ? storedClueHistory
    : history.at(-1)?.clueRounds.length
      ? history.at(-1)!.clueRounds
      : theme && Object.keys(clues).length > 0
        ? [{ round: typeof parsed.round === "number" ? Math.max(1, Math.floor(parsed.round)) : 1, theme, clues }]
        : [];
  const cards = normalizeCards(parsed.cards, players, Object.keys(normalizeNumberRecord(parsed.values)));
  const cardIds = new Set(cards.map((card) => card.id));
  const order = Array.isArray(parsed.order)
    ? parsed.order.filter((id): id is string => typeof id === "string" && cardIds.has(id))
    : [];
  const timeoutFields = normalizePlayerTimeoutFields(parsed, players.map((player) => player.id));
  return {
    code,
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    hostId,
    sorterId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, 40) : "",
    phase: isPhase(parsed.phase) ? parsed.phase : "lobby",
    players,
    ...timeoutFields,
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : 1,
    ...config,
    debugReplayEnabled: parsed.debugReplayEnabled === true && config.debugMode,
    round: typeof parsed.round === "number" ? Math.max(1, Math.floor(parsed.round)) : 1,
    theme,
    cards,
    values: normalizeNumberRecord(parsed.values),
    clues,
    clueHistory,
    order,
    totalPoints: typeof parsed.totalPoints === "number" ? Math.max(0, Math.floor(parsed.totalPoints)) : 0,
    history,
    debugLog: normalizeGameDebugLog(parsed.debugLog),
    phaseStartedAt: typeof parsed.phaseStartedAt === "number" ? parsed.phaseStartedAt : null,
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

function clueComplete(room: HodoaiRoom) {
  return room.cards.every((card) => Boolean(room.clues[card.id]));
}

function timedOut(room: HodoaiRoom, seconds: number, now = Date.now()) {
  return Boolean(room.phaseStartedAt && seconds > 0 && now >= room.phaseStartedAt + seconds * 1000 + commonGameTimeoutGraceMs());
}

function completeClueRound(room: HodoaiRoom) {
  const clues = { ...room.clues };
  for (const card of room.cards) clues[card.id] ||= "時間切れのためパス";
  const clueRound: HodoaiClueRound = { round: room.round, theme: room.theme ?? hodoaiThemes[0], clues };
  const clueHistory = [...room.clueHistory.filter((item) => item.round !== room.round), clueRound].sort((left, right) => left.round - right.round);
  if (hodoaiClueRoundDestination(room.round, room.roundsTotal) === "clue") {
    return {
      ...room,
      phase: "clue" as const,
      round: room.round + 1,
      theme: pickHodoaiTheme(clueHistory),
      clues: {},
      clueHistory,
      phaseStartedAt: Date.now(),
    };
  }
  return {
    ...room,
    phase: "arrange" as const,
    clues,
    clueHistory,
    order: shuffleHodoai(room.cards.map((card) => card.id)),
    phaseStartedAt: Date.now(),
  };
}

function scoreRound(room: HodoaiRoom) {
  const inversions = countHodoaiInversions(room.order, room.values);
  const points = pointsForInversions(inversions);
  const result: HodoaiRoundResult = {
    round: room.round,
    theme: room.theme ?? hodoaiThemes[0],
    inversions,
    points,
    cards: [...room.cards],
    clueRounds: [...room.clueHistory],
    order: [...room.order],
    values: { ...room.values },
    clues: { ...room.clues },
  };
  return {
    ...room,
    phase: "result" as const,
    totalPoints: points,
    history: [result],
    phaseStartedAt: null,
  };
}

function beginGame(room: HodoaiRoom) {
  const dealt = dealHodoaiCards(room.players, room.cardsPerPlayer);
  return {
    ...room,
    phase: "clue" as const,
    round: 1,
    theme: pickHodoaiTheme([]),
    cards: dealt.cards,
    values: dealt.values,
    clues: {},
    clueHistory: [],
    order: [],
    phaseStartedAt: Date.now(),
  };
}

function reconcileProgress(room: HodoaiRoom) {
  if (room.phase === "clue") {
    let next = room;
    for (const player of room.players) {
      const missing = room.cards.filter((card) => card.ownerId === player.id && !next.clues[card.id]);
      if (missing.length > 0 && timedOut(room, playerTimeLimitSeconds(room.clueTimeLimitSeconds, room.playerTimeouts, player.id))) {
        next = recordPlayerTimeout(next, player.id, player.name);
        next = { ...next, clues: { ...next.clues, ...Object.fromEntries(missing.map((card) => [card.id, "時間切れのためパス"])) } };
      }
    }
    if (clueComplete(next) || timedOut(room, room.clueTimeLimitSeconds)) return completeClueRound(next);
    return next;
  }
  if (room.phase === "arrange") {
    const seconds = playerTimeLimitSeconds(room.arrangeTimeLimitSeconds, room.playerTimeouts, room.sorterId);
    if (timedOut(room, seconds)) {
      const sorter = room.players.find((player) => player.id === room.sorterId);
      return scoreRound(sorter ? recordPlayerTimeout(room, sorter.id, sorter.name) : room);
    }
  }
  return room;
}

async function compareAndSetRoom(expectedRevision: number, room: HodoaiRoom) {
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

type HodoaiDebugEvent = { actorId?: string; action: string };

async function mutateStoredRoom(code: string, mutate: (room: HodoaiRoom) => HodoaiRoom, debugEvent?: HodoaiDebugEvent) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await loadStoredHodoaiRoom(code);
    if (!current) throw new Error("HODOAI_ROOM_NOT_FOUND");
    const changed = mutate(current);
    if (changed === current) return current;
    const nextRevision = current.revision + 1;
    const timestamp = Date.now();
    const actorName = debugEvent?.actorId
      ? changed.players.find((player) => player.id === debugEvent.actorId)?.name ?? "不明なプレイヤー"
      : "システム";
    const changedWithLog = changed.debugMode && debugEvent
      ? {
          ...changed,
          debugLog: appendGameDebugLog(changed.debugLog, {
            timestamp,
            actorName,
            action: debugEvent.action,
            phaseBefore: current.phase,
            phaseAfter: changed.phase,
            revision: nextRevision,
          }),
        }
      : changed;
    const next = normalizeRoom({ ...changedWithLog, revision: nextRevision, updatedAt: timestamp });
    if (!next) throw new Error("INVALID_HODOAI_ROOM");
    const saved = await compareAndSetRoom(current.revision, next);
    if (saved === 1) {
      await Promise.all([recordHodoaiGameResults(next), recordHodoaiReplay(next)]);
      return next;
    }
    if (saved === -1) throw new Error("HODOAI_ROOM_NOT_FOUND");
  }
  throw new Error("HODOAI_ROOM_CONFLICT");
}

function makeChoice(room: HodoaiRoom): HodoaiRoomChoice {
  return {
    code: room.code,
    hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown",
    playerCount: room.players.length,
    roundsTotal: room.roundsTotal,
    cardsPerPlayer: room.cardsPerPlayer,
    hasPassphrase: Boolean(room.passphrase),
    updatedAt: room.updatedAt,
  };
}

async function saveActiveRooms(room: HodoaiRoom) {
  await Promise.all(room.players.filter((player) => !player.isDummy).map((player) => redisCommand<"OK">(["SET", playerActiveRoomKey(player.id), room.code, ...multiplayerRoomExpiryArgs()])));
}

async function clearActiveRoom(playerId: string, code: string) {
  const saved = await redisCommand<string | null>(["GET", playerActiveRoomKey(playerId)]);
  if (saved?.trim().toUpperCase() === code.trim().toUpperCase()) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(playerId)]);
  }
}

export function sanitizeHodoaiRoom(room: HodoaiRoom, playerId: string) {
  const isDebugHost = room.debugMode && playerId === room.hostId;
  const revealAll = room.phase === "result" || isDebugHost;
  const ownCardIds = new Set(room.cards.filter((card) => card.ownerId === playerId).map((card) => card.id));
  const values = revealAll ? room.values : Object.fromEntries(Object.entries(room.values).filter(([cardId]) => ownCardIds.has(cardId)));
  const clues = room.phase === "clue" && !isDebugHost
    ? Object.fromEntries(Object.entries(room.clues).filter(([cardId]) => ownCardIds.has(cardId)))
    : room.clues;
  const clueHistory = room.phase === "clue" && !isDebugHost
    ? room.clueHistory.map((clueRound) => ({ ...clueRound, clues: Object.fromEntries(Object.entries(clueRound.clues).filter(([cardId]) => ownCardIds.has(cardId))) }))
    : room.clueHistory;
  return { ...room, passphrase: room.passphrase ? "設定済み" : "", values, clues, clueHistory, debugLog: isDebugHost ? room.debugLog : [] };
}

export async function loadStoredHodoaiRoom(code: string) {
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

function parseStoredHodoaiRoom(raw: string | null) {
  if (!raw) return null;
  try {
    return normalizeRoom(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadAndReconcileHodoaiRoom(code: string) {
  const room = await loadStoredHodoaiRoom(code);
  if (!room) return null;
  if (reconcileProgress(room) === room) {
    await Promise.all([recordHodoaiGameResults(room), recordHodoaiReplay(room)]);
    return room;
  }
  return mutateStoredRoom(code, reconcileProgress, { action: "時間切れ処理" });
}

export async function loadHodoaiPlayerActiveRoom(playerId: string) {
  const normalizedId = playerId.trim();
  if (!normalizedId) return null;
  const code = await redisCommand<string | null>(["GET", playerActiveRoomKey(normalizedId)]);
  if (!code) return null;
  const room = await loadAndReconcileHodoaiRoom(code);
  if (!room || !room.players.some((player) => player.id === normalizedId)) {
    await redisCommand<number>(["DEL", playerActiveRoomKey(normalizedId)]);
    return null;
  }
  return room;
}

export async function createStoredHodoaiRoom(value: unknown, actorId: string) {
  const room = normalizeRoom(value);
  if (!room || actorId !== room.hostId) throw new Error("INVALID_HODOAI_ROOM");
  const created = { ...room, revision: 0, gameNumber: 1, phase: "lobby" as const, cards: [], values: {}, clues: {}, clueHistory: [], order: [], history: [], debugLog: [], totalPoints: 0, updatedAt: Date.now() };
  const activeRoom = await loadHodoaiPlayerActiveRoom(actorId);
  if (activeRoom && activeRoom.code !== created.code) {
    if (!canMoveFromOnlineRoom("hodoai", activeRoom)) throw new Error("HODOAI_PLAYER_ALREADY_ACTIVE");
    await releasePlayerActiveRoom(playerActiveRoomKey(actorId), activeRoom.code);
  }
  const claim = await claimPlayerActiveRoom(playerActiveRoomKey(actorId), created.code);
  if (!claim) throw new Error("HODOAI_PLAYER_ALREADY_ACTIVE");
  try {
    const saved = await redisCommand<"OK" | null>(["SET", roomKey(created.code), JSON.stringify(created), "NX", ...multiplayerRoomExpiryArgs()]);
    if (saved !== "OK") throw new Error("HODOAI_ROOM_CONFLICT");
    await redisCommand<number>(["SADD", roomIndexKey, created.code]);
    await saveActiveRooms(created);
    return created;
  } catch (error) {
    if (claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(actorId), created.code);
    throw error;
  }
}

export async function applyStoredHodoaiAction(code: string, action: HodoaiRoomAction) {
  let claim: ActiveRoomClaim | null = null;
  if (action.type === "join-room") {
    const activeRoom = await loadHodoaiPlayerActiveRoom(action.actorId);
    if (activeRoom && activeRoom.code !== code.trim().toUpperCase()) {
      if (!canMoveFromOnlineRoom("hodoai", activeRoom)) throw new Error("HODOAI_PLAYER_ALREADY_ACTIVE");
      await releasePlayerActiveRoom(playerActiveRoomKey(action.actorId), activeRoom.code);
    }
    claim = await claimPlayerActiveRoom(playerActiveRoomKey(action.actorId), code.trim().toUpperCase());
    if (!claim) throw new Error("HODOAI_PLAYER_ALREADY_ACTIVE");
  }
  const room = await mutateStoredRoom(code, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("HODOAI_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("HODOAI_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return current;
      if (current.players.length >= hodoaiTechnicalPlayerLimit) throw new Error("HODOAI_ROOM_FULL");
      if ((current.players.length + 1) * current.cardsPerPlayer > 121) throw new Error("HODOAI_TOO_MANY_CARDS");
      return { ...current, players: [...current.players, action.player] };
    }

    const actorIsHost = action.actorId === current.hostId;
    const actorIsMember = current.players.some((player) => player.id === action.actorId);
    if (!actorIsMember) throw new Error("HODOAI_ROOM_FORBIDDEN");
    if (action.type === "recover-player") {
      return recoverPlayerTimeout(current, action.actorId, current.players.find((player) => player.id === action.actorId)?.name ?? "プレイヤー") ?? current;
    }
    if (action.type === "abort-game") {
      if (!actorIsHost || !current.debugMode || current.phase === "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      return { ...current, phase: "lobby", debugReplayEnabled: false, round: 1, theme: null, cards: [], values: {}, clues: {}, clueHistory: [], order: [], totalPoints: 0, history: [], phaseStartedAt: null };
    }

    const reconciled = reconcileProgress(current);
    if (reconciled !== current) return reconciled;

    if (action.type === "leave-room") {
      if (actorIsHost || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      return {
        ...current,
        players: current.players.filter((player) => player.id !== action.actorId),
        sorterId: current.sorterId === action.actorId ? current.hostId : current.sorterId,
      };
    }
    if (action.type === "update-config") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      const config = normalizeHodoaiConfig({ ...action.config, debugMode: current.debugMode });
      if (current.players.length * config.cardsPerPlayer > 121) throw new Error("HODOAI_TOO_MANY_CARDS");
      return { ...current, ...config };
    }
    if (action.type === "set-sorter") {
      if (!canAssignHodoaiSorter(current, action.actorId, action.sorterId)) throw new Error("HODOAI_ROOM_FORBIDDEN");
      return { ...current, sorterId: action.sorterId };
    }
    if (action.type === "set-debug") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      return {
        ...current,
        debugMode: action.enabled,
        debugReplayEnabled: action.enabled ? current.debugReplayEnabled : false,
        debugLog: [],
        players: action.enabled ? current.players : current.players.filter((player) => !player.isDummy),
        sorterId: !action.enabled && current.players.find((player) => player.id === current.sorterId)?.isDummy
          ? current.hostId
          : current.sorterId,
      };
    }
    if (action.type === "set-debug-replay") {
      if (!actorIsHost || !current.debugMode) throw new Error("HODOAI_ROOM_FORBIDDEN");
      return { ...current, debugReplayEnabled: action.enabled };
    }
    if (action.type === "start-game") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      if (current.players.length < 2 && !current.debugMode) throw new Error("HODOAI_NOT_ENOUGH_PLAYERS");
      if (current.players.length * current.cardsPerPlayer > 121) throw new Error("HODOAI_TOO_MANY_CARDS");
      return beginGame({ ...current, round: 1, history: [], clueHistory: [], totalPoints: 0 });
    }
    if (action.type === "debug-add-player") {
      if (!actorIsHost || !current.debugMode || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      if (current.players.length >= hodoaiTechnicalPlayerLimit) throw new Error("HODOAI_ROOM_FULL");
      if ((current.players.length + 1) * current.cardsPerPlayer > 121) throw new Error("HODOAI_TOO_MANY_CARDS");
      const dummyNumber = current.players.filter((player) => player.isDummy).length + 1;
      const colors = ["#38bdf8", "#a78bfa", "#f472b6", "#f59e0b", "#84cc16", "#14b8a6"];
      const player: HodoaiPlayer = {
        id: `dummy-${randomUUID()}`,
        name: `ダミー${dummyNumber}`,
        joinedAt: Date.now(),
        avatarColor: colors[(dummyNumber - 1) % colors.length],
        isDummy: true,
      };
      return { ...current, players: [...current.players, player] };
    }
    if (action.type === "submit-clue") {
      const card = current.cards.find((item) => item.id === action.cardId);
      if (current.phase !== "clue" || action.round !== current.round || card?.ownerId !== action.actorId || current.clues[action.cardId]) return current;
      const text = action.text.trim().replace(/\s+/g, " ").slice(0, 40);
      if (text.length < 2 || clueHasNumber(text)) throw new Error("HODOAI_INVALID_CLUE");
      return reconcileProgress(recordPlayerActivity({ ...current, clues: { ...current.clues, [action.cardId]: text } }, action.actorId));
    }
    if (action.type === "reorder") {
      if (!canReorderHodoaiCards(current, action.actorId) || action.round !== current.round) throw new Error("HODOAI_ROOM_FORBIDDEN");
      const expected = [...current.cards.map((card) => card.id)].sort();
      const proposed = [...new Set(action.order)].sort();
      if (expected.length !== proposed.length || expected.some((id, index) => id !== proposed[index])) return current;
      return recordPlayerActivity({ ...current, order: action.order }, action.actorId);
    }
    if (action.type === "score-round") {
      if (!actorIsHost || current.phase !== "arrange" || action.round !== current.round) throw new Error("HODOAI_ROOM_FORBIDDEN");
      return scoreRound(current);
    }
    if (action.type === "reset-game") {
      if (!actorIsHost || current.phase !== "result") throw new Error("HODOAI_ROOM_FORBIDDEN");
      return { ...current, gameNumber: current.gameNumber + 1, phase: "lobby", debugReplayEnabled: false, round: 1, theme: null, cards: [], values: {}, clues: {}, clueHistory: [], order: [], totalPoints: 0, history: [], phaseStartedAt: null };
    }
    if (!actorIsHost || !current.debugMode || action.round !== current.round) throw new Error("HODOAI_ROOM_FORBIDDEN");
    if (action.type === "debug-fill-clues" && current.phase === "clue") {
      const labels = ["ほとんど当てはまらない", "ほんの少し", "やや控えめ", "ほどほど", "なかなか", "かなり", "とても", "最高クラス"];
      const clues = { ...current.clues };
      for (const card of current.cards) clues[card.id] ||= labels[Math.min(7, Math.floor((current.values[card.id] ?? 0) / 16))];
      return completeClueRound({ ...current, clues });
    }
    if (action.type === "debug-sort" && current.phase === "arrange") {
      return { ...current, order: [...current.cards].sort((left, right) => current.values[left.id] - current.values[right.id]).map((card) => card.id) };
    }
    return current;
  }, { actorId: action.actorId, action: hodoaiDebugActionLabels[action.type] }).catch(async (error) => {
    if (action.type === "join-room" && claim === "claimed") await releasePlayerActiveRoom(playerActiveRoomKey(action.actorId), code);
    throw error;
  });
  await redisCommand<number>(["SADD", roomIndexKey, room.code]);
  await saveActiveRooms(room);
  await Promise.all([recordHodoaiGameResults(room), recordHodoaiReplay(room)]);
  if (action.type === "leave-room") await clearActiveRoom(action.actorId, room.code);
  return room;
}

export async function listJoinableHodoaiRooms(cursor?: unknown) {
  const page = await scanOnlineRoomCodes(roomIndexKey, cursor);
  const values = await loadOnlineRoomValues(page.codes, roomKey);
  const parsedRooms = values.map(parseStoredHodoaiRoom);
  const expiredCodes = page.codes.filter((_, index) => parsedRooms[index] && isMultiplayerRoomExpired(parsedRooms[index]!.updatedAt));
  const missingCodes = page.codes.filter((_, index) => !parsedRooms[index]);
  if (expiredCodes.length > 0) await Promise.all(expiredCodes.map(loadStoredHodoaiRoom));
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
  const rooms = parsedRooms
    .filter((room): room is HodoaiRoom => Boolean(
      room
      && !isMultiplayerRoomExpired(room.updatedAt)
      && room.phase === "lobby"
      && room.players.length < hodoaiTechnicalPlayerLimit
      && (room.players.length + 1) * room.cardsPerPlayer <= 121
    ))
    .map(makeChoice)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return { rooms, nextCursor: page.nextCursor };
}

export async function deleteStoredHodoaiRoom(code: string, actorId: string) {
  const room = await loadStoredHodoaiRoom(code);
  if (!room) return;
  if (room.hostId !== actorId) throw new Error("HODOAI_ROOM_FORBIDDEN");
  if (!canDissolveOnlineRoom("hodoai", room)) throw new Error("HODOAI_ROOM_IN_PROGRESS");
  await redisCommand<number>(["DEL", roomKey(code)]);
  await redisCommand<number>(["SREM", roomIndexKey, room.code]);
  await Promise.all(room.players.map((player) => clearActiveRoom(player.id, room.code)));
}

export async function deleteHostedHodoaiRooms(_ownerId: string, authenticatedHostId: string) {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredHodoaiRoom(code)));
  const targets = rooms.filter((room): room is HodoaiRoom => Boolean(room && room.hostId === authenticatedHostId));
  if (targets.some((room) => !canDissolveOnlineRoom("hodoai", room))) throw new Error("HODOAI_ROOM_IN_PROGRESS");
  await Promise.all(targets.map((room) => deleteStoredHodoaiRoom(room.code, room.hostId)));
  return targets.length;
}
