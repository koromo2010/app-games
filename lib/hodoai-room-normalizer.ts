import { normalizeGameDebugLog } from "./game-debug-log.ts";
import { normalizeOnlineRoomCode } from "./online-room-input.ts";
import { normalizePlayerTimeoutFields } from "./player-timeout-policy.ts";
import { isAvatarColor, isAvatarImage } from "./player-session.ts";
import { normalizeRoomLobbyReturnState } from "./room-lobby-return.ts";
import { normalizeRoomContentLocale } from "./game-language.ts";
import {
  defaultHodoaiScoring,
  hodoaiTechnicalPlayerLimit,
  normalizeHodoaiConfig,
  type HodoaiCard,
  type HodoaiClueRound,
  type HodoaiPhase,
  type HodoaiPlayer,
  type HodoaiRoom,
  type HodoaiRoundResult,
  type HodoaiTheme,
} from "./hodoai-talk.ts";

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

export function normalizeHodoaiRoom(value: unknown): HodoaiRoom | null {
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
    contentLocale: normalizeRoomContentLocale(parsed.contentLocale),
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    hostId,
    sorterId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, 40) : "",
    phase: isPhase(parsed.phase) ? parsed.phase : "lobby",
    players,
    lobbyReturn: normalizeRoomLobbyReturnState(parsed.lobbyReturn, players),
    ...timeoutFields,
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : 1,
    gameStartedAt: typeof parsed.gameStartedAt === "number" && Number.isFinite(parsed.gameStartedAt) ? parsed.gameStartedAt : null,
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
    scorePerfect: typeof parsed.scorePerfect === "number" && Number.isInteger(parsed.scorePerfect) ? Math.max(0, Math.min(10, parsed.scorePerfect)) : defaultHodoaiScoring.scorePerfect,
    scoreOne: typeof parsed.scoreOne === "number" && Number.isInteger(parsed.scoreOne) ? Math.max(0, Math.min(10, parsed.scoreOne)) : defaultHodoaiScoring.scoreOne,
    scoreFew: typeof parsed.scoreFew === "number" && Number.isInteger(parsed.scoreFew) ? Math.max(0, Math.min(10, parsed.scoreFew)) : defaultHodoaiScoring.scoreFew,
    scoreFewMax: typeof parsed.scoreFewMax === "number" && Number.isInteger(parsed.scoreFewMax) ? Math.max(2, Math.min(20, parsed.scoreFewMax)) : defaultHodoaiScoring.scoreFewMax,
    history,
    debugLog: normalizeGameDebugLog(parsed.debugLog),
    phaseStartedAt: typeof parsed.phaseStartedAt === "number" ? parsed.phaseStartedAt : null,
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}
