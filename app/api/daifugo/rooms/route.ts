import type { DaifugoRoom, DaifugoRoomAction, DaifugoRoomChoice } from "@/lib/daifugo-room";
import {
  applyStoredDaifugoAction,
  createStoredDaifugoRoom,
  deleteHostedDaifugoRooms,
  deleteStoredDaifugoRoom,
  listJoinableDaifugoRooms,
  loadDaifugoPlayerActiveRoom,
  loadStoredDaifugoRoom,
  reconcileDaifugoDebugDummyTurn,
  sanitizeDaifugoRoom,
} from "@/lib/daifugo-room-store";
import { createOnlineRoomErrorResponder } from "@/lib/online-room-route-errors";
import { createOnlineRoomRouteHandlers } from "@/lib/online-room-route-factory";

const errorResponse = createOnlineRoomErrorResponder({
  errors: {
    DAIFUGO_ROOM_NOT_FOUND: { error: "Room not found", status: 404 },
    DAIFUGO_BAD_PASSPHRASE: { error: "Bad passphrase", status: 401 },
    DAIFUGO_ROOM_FULL: { error: "Room is full", status: 409 },
    DAIFUGO_NOT_ENOUGH_PLAYERS: { error: "Not enough players", status: 409 },
    DAIFUGO_ROOM_IN_PROGRESS: { error: "An active game cannot be dissolved", status: 409 },
    DAIFUGO_PLAYER_ALREADY_ACTIVE: { error: "Finish or leave the current room before entering another room", status: 409 },
    DAIFUGO_INVALID_CONFIG: { error: "Invalid game configuration", status: 400 },
    DAIFUGO_INVALID_PLAY: { error: "Invalid play", status: 400 },
    DAIFUGO_ROOM_FORBIDDEN: { error: "Room action is not allowed", status: 403 },
    DAIFUGO_ROOM_CONFLICT: { error: "Room update conflicted; retry", status: 409 },
    INVALID_DAIFUGO_ROOM: { error: "Invalid room", status: 400 },
  },
});

const handlers = createOnlineRoomRouteHandlers<DaifugoRoom, DaifugoRoomChoice>({
  gameId: "daifugo",
  route: "/api/daifugo/rooms",
  errorResponse,
  read: {
    loadRoom: loadStoredDaifugoRoom,
    loadActiveRoom: loadDaifugoPlayerActiveRoom,
    listRooms: listJoinableDaifugoRooms,
    presentRoom: sanitizeDaifugoRoom,
    afterLoad: reconcileDaifugoDebugDummyTurn,
    versioned: false,
  },
  create: ({ roomDraft, session }) => createStoredDaifugoRoom(roomDraft, session.id),
  command: ({ code, action }) => applyStoredDaifugoAction(code, action as DaifugoRoomAction),
  delete: {
    room: ({ code, session }) => deleteStoredDaifugoRoom(code, session.id),
    hosted: ({ ownerId, session }) => deleteHostedDaifugoRooms(ownerId, session.id),
  },
  telemetryFields: (room) => ({
    phase: room.phase,
    revision: room.revision,
    gameNumber: room.gameNumber,
    playerCount: room.players.length,
    debugMode: room.debugMode,
  }),
});

export async function GET(request: Request) { return handlers.GET(request); }
export async function POST(request: Request) { return handlers.POST(request); }
export async function PATCH(request: Request) { return handlers.PATCH(request); }
export async function DELETE(request: Request) { return handlers.DELETE(request); }
