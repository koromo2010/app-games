import type { HodoaiRoom, HodoaiRoomAction, HodoaiRoomChoice } from "@/lib/hodoai-talk";
import {
  applyStoredHodoaiAction,
  createStoredHodoaiRoom,
  deleteHostedHodoaiRooms,
  deleteStoredHodoaiRoom,
  listJoinableHodoaiRooms,
  loadAndReconcileHodoaiRoom,
  loadHodoaiPlayerActiveRoom,
  sanitizeHodoaiRoom,
} from "@/lib/hodoai-room-store";
import { createOnlineRoomErrorResponder } from "@/lib/online-room-route-errors";
import { createOnlineRoomRouteHandlers } from "@/lib/online-room-route-factory";

const errorResponse = createOnlineRoomErrorResponder({
  errors: {
    HODOAI_ROOM_NOT_FOUND: { error: "Room not found", status: 404 },
    HODOAI_BAD_PASSPHRASE: { error: "Bad passphrase", status: 401 },
    HODOAI_ROOM_FULL: { error: "Room is full", status: 409 },
    HODOAI_TOO_MANY_CARDS: { error: "Too many cards for this room", status: 409 },
    HODOAI_NOT_ENOUGH_PLAYERS: { error: "Not enough players", status: 409 },
    HODOAI_ROOM_IN_PROGRESS: { error: "An active game cannot be dissolved", status: 409 },
    HODOAI_PLAYER_ALREADY_ACTIVE: { error: "Finish or leave the current room before entering another room", status: 409 },
    HODOAI_INVALID_CLUE: { error: "Invalid clue", status: 400 },
    HODOAI_ROOM_FORBIDDEN: { error: "Room action is not allowed", status: 403 },
    HODOAI_ROOM_CONFLICT: { error: "Room update conflicted; retry", status: 409 },
    INVALID_HODOAI_ROOM: { error: "Invalid room", status: 400 },
  },
});

const handlers = createOnlineRoomRouteHandlers<HodoaiRoom, HodoaiRoomChoice>({
  gameId: "hodoai",
  route: "/api/hodoai/rooms",
  errorResponse,
  read: {
    loadRoom: loadAndReconcileHodoaiRoom,
    loadActiveRoom: loadHodoaiPlayerActiveRoom,
    listRooms: listJoinableHodoaiRooms,
    presentRoom: sanitizeHodoaiRoom,
  },
  create: ({ roomDraft, session }) => createStoredHodoaiRoom(roomDraft, session.id),
  command: ({ code, action }) => applyStoredHodoaiAction(code, action as HodoaiRoomAction),
  delete: {
    room: ({ code, session }) => deleteStoredHodoaiRoom(code, session.id),
    hosted: ({ ownerId, session }) => deleteHostedHodoaiRooms(ownerId, session.id),
  },
  telemetryFields: (room) => ({
    phase: room.phase,
    revision: room.revision,
    round: room.round,
    playerCount: room.players.length,
    debugMode: room.debugMode,
  }),
});

export async function GET(request: Request) { return handlers.GET(request); }
export async function POST(request: Request) { return handlers.POST(request); }
export async function PATCH(request: Request) { return handlers.PATCH(request); }
export async function DELETE(request: Request) { return handlers.DELETE(request); }
