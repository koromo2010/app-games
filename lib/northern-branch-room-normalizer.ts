import { northernRules } from "@/lib/northern-branch-game";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import type {
  NorthernGameState,
  NorthernRoom,
  NorthernRoomPhase,
  NorthernRoomPlayer,
} from "@/lib/northern-branch-types";
import { normalizeOnlineRoomCode } from "@/lib/online-room-input";
import { onlineRoomPlayerLimits } from "@/lib/online-room-policy";
import { isAvatarColor, isAvatarImage } from "@/lib/player-session";
import { normalizeRoomLobbyReturnState } from "@/lib/room-lobby-return";

const maximumPlayers = onlineRoomPlayerLimits.northernBranch;

function isPhase(value: unknown): value is NorthernRoomPhase {
  return value === "lobby" || value === "playing" || value === "finished";
}

function normalizePlayers(value: unknown): NorthernRoomPlayer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((player): player is NorthernRoomPlayer => Boolean(player?.id && player?.name))
    .slice(0, maximumPlayers)
    .map((player) => ({
      id: String(player.id).slice(0, 80),
      name: String(player.name).trim().slice(0, 20),
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      avatarColor: isAvatarColor(player.avatarColor ?? null) ? player.avatarColor : undefined,
      avatarImage: isAvatarImage(player.avatarImage ?? null) ? player.avatarImage : undefined,
      isDummy: player.isDummy === true,
    }));
}

function normalizeGame(value: unknown, playerIds: Set<string>): NorthernGameState | null {
  if (!value || typeof value !== "object") return null;
  const game = value as NorthernGameState;
  if (!Array.isArray(game.players) || game.players.length < 2) return null;
  if (game.players.some((player) => !playerIds.has(player.id))) return null;
  if (!Array.isArray(game.offers) || !Array.isArray(game.offerDeck) || !Array.isArray(game.discard) || !Array.isArray(game.log)) return null;
  const storedRules = game.rules && typeof game.rules === "object" ? game.rules : northernRules;
  return {
    ...game,
    rules: {
      handLimit: Number.isInteger(storedRules.handLimit) ? Math.max(3, Math.min(12, storedRules.handLimit)) : northernRules.handLimit,
      victoryPoints: Number.isInteger(storedRules.victoryPoints) ? Math.max(5, Math.min(30, storedRules.victoryPoints)) : northernRules.victoryPoints,
      marketSize: Number.isInteger(storedRules.marketSize) ? Math.max(3, Math.min(10, storedRules.marketSize)) : northernRules.marketSize,
    },
  };
}

export function normalizeNorthernRoom(value: unknown): NorthernRoom | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<NorthernRoom>;
  const code = normalizeOnlineRoomCode(parsed.code);
  const hostId = typeof parsed.hostId === "string" ? parsed.hostId : "";
  const players = normalizePlayers(parsed.players);
  if (!code || !hostId || players.length === 0 || !players.some((player) => player.id === hostId)) return null;
  const phase = isPhase(parsed.phase) ? parsed.phase : "lobby";
  const game = phase === "lobby" ? null : normalizeGame(parsed.game, new Set(players.map((player) => player.id)));
  if (phase !== "lobby" && !game) return null;
  return {
    code,
    revision: typeof parsed.revision === "number" ? Math.max(0, Math.floor(parsed.revision)) : 0,
    hostId,
    ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase.slice(0, 40) : "",
    phase,
    players,
    lobbyReturn: normalizeRoomLobbyReturnState(parsed.lobbyReturn, players),
    gameNumber: typeof parsed.gameNumber === "number" ? Math.max(1, Math.floor(parsed.gameNumber)) : 1,
    gameStartedAt: typeof parsed.gameStartedAt === "number" && Number.isFinite(parsed.gameStartedAt) ? parsed.gameStartedAt : null,
    debugMode: parsed.debugMode === true,
    debugReplayEnabled: parsed.debugReplayEnabled === true && parsed.debugMode === true,
    turnTimeLimitSeconds: normalizeCommonTimeLimit(parsed.turnTimeLimitSeconds),
    turnStartedAt: phase === "playing" && typeof parsed.turnStartedAt === "number" && Number.isFinite(parsed.turnStartedAt) ? parsed.turnStartedAt : null,
    game,
    notice: typeof parsed.notice === "string" ? parsed.notice.slice(0, 160) : "",
    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
}
