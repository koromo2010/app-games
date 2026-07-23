import {
  applyStoredNorthernAction,
  createStoredNorthernRoom,
  deleteHostedNorthernRooms,
  deleteStoredNorthernRoom,
  listJoinableNorthernRooms,
  loadNorthernPlayerActiveRoom,
  loadStoredNorthernRoom,
  sanitizeNorthernRoom,
} from "@/lib/northern-branch-room-store";
import type { NorthernRoom, NorthernRoomAction, NorthernRoomChoice } from "@/lib/northern-branch-types";
import { createOnlineRoomErrorResponder } from "@/lib/online-room-route-errors";
import { createOnlineRoomRouteHandlers } from "@/lib/online-room-route-factory";

const errorResponse = createOnlineRoomErrorResponder({
  errors: {
    NORTHERN_ROOM_NOT_FOUND: { error: "Room not found", status: 404 },
    NORTHERN_BAD_PASSPHRASE: { error: "Bad passphrase", status: 401 },
    NORTHERN_ROOM_FULL: { error: "Room is full", status: 409 },
    NORTHERN_NOT_ENOUGH_PLAYERS: { error: "Not enough players", status: 409 },
    NORTHERN_ROOM_IN_PROGRESS: { error: "An active game cannot be dissolved", status: 409 },
    NORTHERN_PLAYER_ALREADY_ACTIVE: { error: "Finish or leave the current room before entering another room", status: 409 },
    NORTHERN_NOT_YOUR_TURN: { error: "Not your turn", status: 403 },
    NORTHERN_ROOM_FORBIDDEN: { error: "Room action is not allowed", status: 403 },
    NORTHERN_ROOM_CONFLICT: { error: "Room update conflicted; retry", status: 409 },
    INVALID_NORTHERN_ROOM: { error: "Invalid room", status: 400 },
  },
  dynamic: (message) => message.startsWith("NORTHERN_ACTION_INVALID:")
    ? { error: message.slice("NORTHERN_ACTION_INVALID:".length), status: 400 }
    : null,
});

const handlers = createOnlineRoomRouteHandlers<NorthernRoom, NorthernRoomChoice>({
  gameId: "northern-branch",
  route: "/api/northern-branch/rooms",
  errorResponse,
  read: {
    loadRoom: loadStoredNorthernRoom,
    loadActiveRoom: loadNorthernPlayerActiveRoom,
    listRooms: listJoinableNorthernRooms,
    presentRoom: sanitizeNorthernRoom,
  },
  create: ({ roomDraft, session }) => createStoredNorthernRoom(roomDraft, session.id),
  command: ({ code, action }) => applyStoredNorthernAction(code, action as NorthernRoomAction),
  delete: {
    room: ({ code, session }) => deleteStoredNorthernRoom(code, session.id),
    hosted: ({ ownerId, session }) => deleteHostedNorthernRooms(ownerId, session.id),
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
