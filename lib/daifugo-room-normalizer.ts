import { analyzeDaifugoMeld, type DaifugoGameState, type DaifugoLastAction, type DaifugoPlayer } from "./daifugo.ts";
import { normalizeDaifugoCapacity } from "./daifugo-room-domain.ts";
import { daifugoMaximumPlayers, type DaifugoRoom, type DaifugoRoomPlayer } from "./daifugo-room.ts";
import { normalizeGameDebugLog } from "./game-debug-log.ts";
import { normalizeCommonTimeLimit } from "./game-room-config.ts";
import { normalizeOnlineRoomCode } from "./online-room-policy.ts";
import { isAvatarColor, isAvatarImage } from "./player-session.ts";
import { isPlayingCardCollection, type PlayingCard } from "./playing-cards.ts";
import { normalizeRoomLobbyReturnState } from "./room-lobby-return.ts";

function normalizePlayers(value: unknown): DaifugoRoomPlayer[] {
  if (!Array.isArray(value)) return [];
  const players = value.flatMap((item): DaifugoRoomPlayer[] => {
    if (!item || typeof item !== "object") return [];
    const player = item as Partial<DaifugoRoomPlayer>;
    const id = typeof player.id === "string" ? player.id.trim().slice(0, 120) : "";
    const name = typeof player.name === "string" ? player.name.trim().slice(0, 20) : "";
    const avatarColor = player.avatarColor ?? null;
    if (!id || !name || !isAvatarColor(avatarColor)) return [];
    return [{
      id,
      name,
      joinedAt: typeof player.joinedAt === "number" && Number.isFinite(player.joinedAt) ? player.joinedAt : Date.now(),
      avatarColor,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
      shareNameAllowed: player.shareNameAllowed === true,
      isDummy: player.isDummy === true,
    }];
  }).slice(0, daifugoMaximumPlayers);
  return new Set(players.map((player) => player.id)).size === players.length ? players : [];
}

function normalizeIdList(value: unknown, playerIds: ReadonlySet<string>) {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is string => typeof item === "string");
  if (ids.length !== value.length || new Set(ids).size !== ids.length || ids.some((id) => !playerIds.has(id))) return null;
  return ids;
}

function normalizeLastAction(value: unknown, playerIds: ReadonlySet<string>): DaifugoLastAction | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const action = value as Partial<DaifugoLastAction>;
  if (typeof action.playerId !== "string" || !playerIds.has(action.playerId)
    || (action.type !== "play" && action.type !== "pass")
    || !Number.isInteger(action.cardCount) || (action.cardCount ?? -1) < 0 || (action.cardCount ?? 5) > 4) return undefined;
  return { playerId: action.playerId, type: action.type, cardCount: action.cardCount as number };
}

function normalizeGame(value: unknown, roomPlayers: DaifugoRoomPlayer[]): DaifugoGameState | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<DaifugoGameState>;
  const playerIds = new Set(roomPlayers.map((player) => player.id));
  if (!Array.isArray(parsed.players) || parsed.players.length !== roomPlayers.length) return null;
  const players = parsed.players.flatMap((player): DaifugoPlayer[] => {
    if (!player || typeof player !== "object" || typeof player.id !== "string" || !playerIds.has(player.id)) return [];
    const roomPlayer = roomPlayers.find((candidate) => candidate.id === player.id)!;
    return [{ id: player.id, name: roomPlayer.name, kind: "human" }];
  });
  if (players.length !== roomPlayers.length || new Set(players.map((player) => player.id)).size !== players.length) return null;
  if (!parsed.hands || typeof parsed.hands !== "object") return null;
  const hands: Record<string, PlayingCard[]> = {};
  for (const player of players) {
    const hand = (parsed.hands as Record<string, unknown>)[player.id];
    if (!isPlayingCardCollection(hand, 53)) return null;
    hands[player.id] = hand;
  }
  const table = parsed.table === null ? null : parsed.table && typeof parsed.table === "object"
    && isPlayingCardCollection((parsed.table as { cards?: unknown }).cards, 4)
    ? analyzeDaifugoMeld((parsed.table as { cards: PlayingCard[] }).cards)
    : null;
  if (parsed.table !== null && !table) return null;
  const allCards = [...Object.values(hands).flat(), ...(table?.cards ?? [])];
  if (new Set(allCards.map((card) => card.id)).size !== allCards.length || allCards.length > 53) return null;
  const passedPlayerIds = normalizeIdList(parsed.passedPlayerIds, playerIds);
  const finishOrder = normalizeIdList(parsed.finishOrder, playerIds);
  const lastAction = normalizeLastAction(parsed.lastAction, playerIds);
  const status = parsed.status === "finished" ? "finished" : parsed.status === "playing" ? "playing" : null;
  const currentPlayerId = parsed.currentPlayerId === null ? null : typeof parsed.currentPlayerId === "string" && playerIds.has(parsed.currentPlayerId) ? parsed.currentPlayerId : undefined;
  const lastPlayedById = parsed.lastPlayedById === null ? null : typeof parsed.lastPlayedById === "string" && playerIds.has(parsed.lastPlayedById) ? parsed.lastPlayedById : undefined;
  if (!status || !passedPlayerIds || !finishOrder || lastAction === undefined || currentPlayerId === undefined || lastPlayedById === undefined
    || typeof parsed.firstPlay !== "boolean" || !Number.isInteger(parsed.turnNumber) || (parsed.turnNumber ?? 0) < 1
    || (status === "finished") !== (currentPlayerId === null)) return null;
  return { status, players, hands, currentPlayerId, table, lastPlayedById, passedPlayerIds, finishOrder, firstPlay: parsed.firstPlay, turnNumber: parsed.turnNumber as number, lastAction };
}

export function normalizeDaifugoRoom(value: unknown): DaifugoRoom | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<DaifugoRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const players = normalizePlayers(parsed.players);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  if (!code || players.length === 0 || !players.some((player) => player.id === hostId)) return null;
  const phase = parsed.phase === "playing" || parsed.phase === "result" ? parsed.phase : "lobby";
  const game = phase === "lobby" ? null : normalizeGame(parsed.game, players);
  if (phase !== "lobby" && !game) return null;
  if ((phase === "playing") !== (game?.status === "playing") || (phase === "result") !== (game?.status === "finished")) return null;
  const now = Date.now();
  return {
    code,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId.slice(0, 120) : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, 40) : "",
    phase,
    players,
    lobbyReturn: normalizeRoomLobbyReturnState(parsed.lobbyReturn, players),
    playerCapacity: normalizeDaifugoCapacity(Math.max(players.length, normalizeDaifugoCapacity(parsed.playerCapacity))),
    turnTimeLimitSeconds: normalizeCommonTimeLimit(parsed.turnTimeLimitSeconds),
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    createdAt: typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt) ? parsed.createdAt : now,
    updatedAt: typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : now,
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : 1,
    gameStartedAt: game && typeof parsed.gameStartedAt === "number" && Number.isFinite(parsed.gameStartedAt) ? parsed.gameStartedAt : null,
    phaseStartedAt: phase === "playing" && typeof parsed.phaseStartedAt === "number" && Number.isFinite(parsed.phaseStartedAt) ? parsed.phaseStartedAt : null,
    game,
    debugMode: parsed.debugMode === true,
    debugReplayEnabled: parsed.debugMode === true && parsed.debugReplayEnabled === true,
    debugLog: normalizeGameDebugLog(parsed.debugLog),
  };
}
