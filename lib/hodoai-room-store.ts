import { redisCommand } from "@/lib/redis-store";
import { recordHodoaiGameResults } from "@/lib/player-stats-store";
import { isMultiplayerRoomExpired, multiplayerRoomExpiryArgs, multiplayerRoomTtlSeconds } from "@/lib/multiplayer-room-lifecycle";
import { randomUUID } from "node:crypto";
import { commonGameTimeoutGraceMs } from "@/lib/game-timer/policy";
import {
  clueHasNumber,
  countHodoaiInversions,
  dealHodoaiValues,
  hodoaiThemes,
  hodoaiTechnicalPlayerLimit,
  normalizeHodoaiConfig,
  pickHodoaiTheme,
  pointsForInversions,
  shuffleHodoai,
  type HodoaiPhase,
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
      id: String(player.id),
      name: String(player.name).trim().slice(0, 20),
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      avatarColor: typeof player.avatarColor === "string" ? player.avatarColor : undefined,
      avatarImage: typeof player.avatarImage === "string" ? player.avatarImage : undefined,
      isDummy: player.isDummy === true,
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

function normalizeHistory(value: unknown): HodoaiRoundResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const result = item as Partial<HodoaiRoundResult>;
    const theme = normalizeTheme(result.theme);
    if (!theme) return [];
    return [{
      round: typeof result.round === "number" ? Math.max(1, Math.floor(result.round)) : 1,
      theme,
      inversions: typeof result.inversions === "number" ? Math.max(0, Math.floor(result.inversions)) : 0,
      points: typeof result.points === "number" ? Math.max(0, Math.min(3, Math.floor(result.points))) : 0,
      order: Array.isArray(result.order) ? result.order.filter((id): id is string => typeof id === "string") : [],
      values: normalizeNumberRecord(result.values),
      clues: normalizeStringRecord(result.clues),
    }];
  });
}

function normalizeRoom(value: unknown): HodoaiRoom | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<HodoaiRoom>;
  const code = typeof parsed.code === "string" ? parsed.code.trim().toUpperCase() : "";
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  const players = normalizePlayers(parsed.players);
  if (!code || !hostId || players.length === 0 || !players.some((player) => player.id === hostId)) return null;
  const config = normalizeHodoaiConfig(parsed);
  const history = normalizeHistory(parsed.history);
  const playerIds = new Set(players.map((player) => player.id));
  const order = Array.isArray(parsed.order)
    ? parsed.order.filter((id): id is string => typeof id === "string" && playerIds.has(id))
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
    round: typeof parsed.round === "number" ? Math.max(1, Math.floor(parsed.round)) : 1,
    theme: normalizeTheme(parsed.theme),
    values: normalizeNumberRecord(parsed.values),
    clues: normalizeStringRecord(parsed.clues),
    order,
    totalPoints: typeof parsed.totalPoints === "number" ? Math.max(0, Math.floor(parsed.totalPoints)) : 0,
    history,
    phaseStartedAt: typeof parsed.phaseStartedAt === "number" ? parsed.phaseStartedAt : null,
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}

function clueComplete(room: HodoaiRoom) {
  return room.players.every((player) => Boolean(room.clues[player.id]));
}

function timedOut(room: HodoaiRoom, seconds: number, now = Date.now()) {
  return Boolean(room.phaseStartedAt && seconds > 0 && now >= room.phaseStartedAt + seconds * 1000 + commonGameTimeoutGraceMs());
}

function advanceToArrange(room: HodoaiRoom) {
  const clues = { ...room.clues };
  for (const player of room.players) clues[player.id] ||= "時間切れのためパス";
  return {
    ...room,
    phase: "arrange" as const,
    clues,
    order: shuffleHodoai(room.players.map((player) => player.id)),
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
    order: [...room.order],
    values: { ...room.values },
    clues: { ...room.clues },
  };
  return {
    ...room,
    phase: "result" as const,
    totalPoints: room.totalPoints + points,
    history: [...room.history.filter((item) => item.round !== room.round), result],
    phaseStartedAt: null,
  };
}

function beginRound(room: HodoaiRoom, round: number) {
  return {
    ...room,
    phase: "clue" as const,
    round,
    theme: pickHodoaiTheme(room.history),
    values: dealHodoaiValues(room.players),
    clues: {},
    order: [],
    phaseStartedAt: Date.now(),
  };
}

function reconcileProgress(room: HodoaiRoom) {
  if (room.phase === "clue" && (clueComplete(room) || timedOut(room, room.clueTimeLimitSeconds))) {
    return advanceToArrange(room);
  }
  if (room.phase === "arrange" && timedOut(room, room.arrangeTimeLimitSeconds)) return scoreRound(room);
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

async function mutateStoredRoom(code: string, mutate: (room: HodoaiRoom) => HodoaiRoom) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await loadStoredHodoaiRoom(code);
    if (!current) throw new Error("HODOAI_ROOM_NOT_FOUND");
    const changed = mutate(current);
    if (changed === current) return current;
    const next = normalizeRoom({ ...changed, revision: current.revision + 1, updatedAt: Date.now() });
    if (!next) throw new Error("INVALID_HODOAI_ROOM");
    const saved = await compareAndSetRoom(current.revision, next);
    if (saved === 1) {
      await recordHodoaiGameResults(next);
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
  const values = revealAll
    ? room.values
    : typeof room.values[playerId] === "number"
      ? { [playerId]: room.values[playerId] }
      : {};
  const clues = room.phase === "clue" && !isDebugHost
    ? room.clues[playerId] ? { [playerId]: room.clues[playerId] } : {}
    : room.clues;
  return { ...room, passphrase: room.passphrase ? "設定済み" : "", values, clues };
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

export async function loadAndReconcileHodoaiRoom(code: string) {
  const room = await loadStoredHodoaiRoom(code);
  if (!room) return null;
  if (reconcileProgress(room) === room) {
    await recordHodoaiGameResults(room);
    return room;
  }
  return mutateStoredRoom(code, reconcileProgress);
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
  const created = { ...room, revision: 0, gameNumber: 1, phase: "lobby" as const, values: {}, clues: {}, order: [], history: [], totalPoints: 0, updatedAt: Date.now() };
  const saved = await redisCommand<"OK" | null>(["SET", roomKey(created.code), JSON.stringify(created), "NX", ...multiplayerRoomExpiryArgs()]);
  if (saved !== "OK") throw new Error("HODOAI_ROOM_CONFLICT");
  await redisCommand<number>(["SADD", roomIndexKey, created.code]);
  await saveActiveRooms(created);
  return created;
}

export async function applyStoredHodoaiAction(code: string, action: HodoaiRoomAction) {
  const room = await mutateStoredRoom(code, (current) => {
    if (action.type === "join-room") {
      if (current.phase !== "lobby" || action.actorId !== action.player.id) throw new Error("HODOAI_ROOM_FORBIDDEN");
      if (current.passphrase && current.passphrase !== action.passphrase.trim()) throw new Error("HODOAI_BAD_PASSPHRASE");
      if (current.players.some((player) => player.id === action.actorId)) return current;
      if (current.players.length >= hodoaiTechnicalPlayerLimit) throw new Error("HODOAI_ROOM_FULL");
      return { ...current, players: [...current.players, action.player] };
    }

    const reconciled = reconcileProgress(current);
    if (reconciled !== current) return reconciled;

    const actorIsHost = action.actorId === current.hostId;
    const actorIsMember = current.players.some((player) => player.id === action.actorId);
    if (!actorIsMember) throw new Error("HODOAI_ROOM_FORBIDDEN");

    if (action.type === "leave-room") {
      if (actorIsHost || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      return { ...current, players: current.players.filter((player) => player.id !== action.actorId) };
    }
    if (action.type === "update-config") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      const config = normalizeHodoaiConfig({ ...action.config, debugMode: current.debugMode });
      return { ...current, ...config };
    }
    if (action.type === "set-debug") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      return {
        ...current,
        debugMode: action.enabled,
        players: action.enabled ? current.players : current.players.filter((player) => !player.isDummy),
      };
    }
    if (action.type === "start-game") {
      if (!actorIsHost || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      if (current.players.length < 2 && !current.debugMode) throw new Error("HODOAI_NOT_ENOUGH_PLAYERS");
      return beginRound({ ...current, round: 1, history: [], totalPoints: 0 }, 1);
    }
    if (action.type === "debug-add-player") {
      if (!actorIsHost || !current.debugMode || current.phase !== "lobby") throw new Error("HODOAI_ROOM_FORBIDDEN");
      if (current.players.length >= hodoaiTechnicalPlayerLimit) throw new Error("HODOAI_ROOM_FULL");
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
      if (current.phase !== "clue" || action.round !== current.round || current.clues[action.actorId]) return current;
      const text = action.text.trim().replace(/\s+/g, " ").slice(0, 40);
      if (text.length < 2 || clueHasNumber(text)) throw new Error("HODOAI_INVALID_CLUE");
      return reconcileProgress({ ...current, clues: { ...current.clues, [action.actorId]: text } });
    }
    if (action.type === "reorder") {
      if (!actorIsHost || current.phase !== "arrange" || action.round !== current.round) throw new Error("HODOAI_ROOM_FORBIDDEN");
      const expected = [...current.players.map((player) => player.id)].sort();
      const proposed = [...new Set(action.order)].sort();
      if (expected.length !== proposed.length || expected.some((id, index) => id !== proposed[index])) return current;
      return { ...current, order: action.order };
    }
    if (action.type === "score-round") {
      if (!actorIsHost || current.phase !== "arrange" || action.round !== current.round) throw new Error("HODOAI_ROOM_FORBIDDEN");
      return scoreRound(current);
    }
    if (action.type === "next-round") {
      if (!actorIsHost || current.phase !== "result" || action.round !== current.round || current.round >= current.roundsTotal) {
        throw new Error("HODOAI_ROOM_FORBIDDEN");
      }
      return beginRound(current, current.round + 1);
    }
    if (action.type === "reset-game") {
      if (!actorIsHost || current.phase !== "result") throw new Error("HODOAI_ROOM_FORBIDDEN");
      return { ...current, gameNumber: current.gameNumber + 1, phase: "lobby", round: 1, theme: null, values: {}, clues: {}, order: [], totalPoints: 0, history: [], phaseStartedAt: null };
    }
    if (!actorIsHost || !current.debugMode || action.round !== current.round) throw new Error("HODOAI_ROOM_FORBIDDEN");
    if (action.type === "debug-fill-clues" && current.phase === "clue") {
      const labels = ["ほとんど当てはまらない", "ほんの少し", "やや控えめ", "ほどほど", "なかなか", "かなり", "とても", "最高クラス"];
      const clues = { ...current.clues };
      for (const player of current.players) clues[player.id] ||= labels[Math.min(7, Math.floor((current.values[player.id] ?? 0) / 16))];
      return advanceToArrange({ ...current, clues });
    }
    if (action.type === "debug-sort" && current.phase === "arrange") {
      return { ...current, order: [...current.players].sort((left, right) => current.values[left.id] - current.values[right.id]).map((player) => player.id) };
    }
    return current;
  });
  await redisCommand<number>(["SADD", roomIndexKey, room.code]);
  await saveActiveRooms(room);
  await recordHodoaiGameResults(room);
  if (action.type === "leave-room") await clearActiveRoom(action.actorId, room.code);
  return room;
}

export async function listJoinableHodoaiRooms() {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredHodoaiRoom(code)));
  const missingCodes = codes.filter((_, index) => !rooms[index]);
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
  return rooms.filter((room): room is HodoaiRoom => Boolean(room && room.phase === "lobby")).map(makeChoice).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteStoredHodoaiRoom(code: string, actorId: string) {
  const room = await loadStoredHodoaiRoom(code);
  if (!room) return;
  if (room.hostId !== actorId) throw new Error("HODOAI_ROOM_FORBIDDEN");
  await redisCommand<number>(["DEL", roomKey(code)]);
  await redisCommand<number>(["SREM", roomIndexKey, room.code]);
  await Promise.all(room.players.map((player) => clearActiveRoom(player.id, room.code)));
}

export async function deleteHostedHodoaiRooms(_ownerId: string, authenticatedHostId: string) {
  const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
  const rooms = await Promise.all(codes.map((code) => loadStoredHodoaiRoom(code)));
  const targets = rooms.filter((room): room is HodoaiRoom => Boolean(room && room.hostId === authenticatedHostId));
  await Promise.all(targets.map((room) => deleteStoredHodoaiRoom(room.code, room.hostId)));
  return targets.length;
}
