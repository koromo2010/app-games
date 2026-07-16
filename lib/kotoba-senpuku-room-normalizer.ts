import {
  isValidKotobaSenpukuWord,
  kotobaSenpukuKana,
  normalizeKotobaSenpukuConfig,
  normalizeKotobaSenpukuWord,
  type KotobaSenpukuEvent,
  type KotobaSenpukuPhase,
  type KotobaSenpukuPlayer,
  type KotobaSenpukuRoom,
  type KotobaSenpukuRoundResult,
  type KotobaSenpukuTheme,
} from "@/lib/kotoba-senpuku";
import { normalizeOnlineRoomCode } from "@/lib/online-room-input";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { normalizePlayerTimeoutFields } from "@/lib/player-timeout-policy";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";

function isPhase(value: unknown): value is KotobaSenpukuPhase {
  return value === "lobby" || value === "secret" || value === "battle" || value === "result";
}

function normalizePlayers(value: unknown): KotobaSenpukuPlayer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((player): player is KotobaSenpukuPlayer => Boolean(player?.id && player?.name))
    .slice(0, onlineRoomPlayerLimits.kotobaSenpuku)
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

export function normalizeKotobaSenpukuRoom(value: unknown): KotobaSenpukuRoom | null {
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
    ...normalizePlayerTimeoutFields(parsed, players.map((player) => player.id)),
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

