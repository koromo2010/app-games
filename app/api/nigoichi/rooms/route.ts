import type { NigoichiRoom, NigoichiRoomAction, NigoichiRoomChoice } from "@/lib/nigoichi";
import {
  applyStoredNigoichiAction,
  createStoredNigoichiRoom,
  deleteHostedNigoichiRooms,
  deleteStoredNigoichiRoom,
  listJoinableNigoichiRooms,
  loadNigoichiPlayerActiveRoom,
  loadStoredNigoichiRoom,
  sanitizeNigoichiRoom,
} from "@/lib/nigoichi-room-store";
import { createOnlineRoomErrorResponder } from "@/lib/online-room-route-errors";
import { createOnlineRoomRouteHandlers } from "@/lib/online-room-route-factory";

const errorResponse = createOnlineRoomErrorResponder({
  errors: {
    NIGOICHI_ROOM_NOT_FOUND: { error: "Room not found", status: 404 },
    NIGOICHI_BAD_PASSPHRASE: { error: "Bad passphrase", status: 401 },
    NIGOICHI_ROOM_FULL: { error: "Room is full", status: 409 },
    NIGOICHI_NOT_ENOUGH_PLAYERS: { error: "Not enough players", status: 409 },
    NIGOICHI_WORDS_UNAVAILABLE: {
      error: "General Game Poolから設定した難易度の単語を取得できませんでした。",
      errorCode: "NIGOICHI_WORDS_UNAVAILABLE",
      status: 503,
    },
    NIGOICHI_ROOM_IN_PROGRESS: { error: "An active game cannot be dissolved", status: 409 },
    NIGOICHI_PLAYER_ALREADY_ACTIVE: { error: "Finish or leave the current room before entering another room", status: 409 },
    NIGOICHI_INVALID_CLUE: { error: "Invalid clue", status: 400 },
    NIGOICHI_INVALID_CONFIG: { error: "Invalid game configuration", status: 400 },
    NIGOICHI_INVALID_GUESS: { error: "Invalid guess", status: 400 },
    NIGOICHI_ROOM_FORBIDDEN: { error: "Room action is not allowed", status: 403 },
    NIGOICHI_ROOM_CONFLICT: { error: "Room update conflicted; retry", status: 409 },
    INVALID_NIGOICHI_ROOM: { error: "Invalid room", status: 400 },
  },
});

const handlers = createOnlineRoomRouteHandlers<NigoichiRoom, NigoichiRoomChoice>({
  gameId: "nigoichi",
  route: "/api/nigoichi/rooms",
  errorResponse,
  read: {
    loadRoom: loadStoredNigoichiRoom,
    loadActiveRoom: loadNigoichiPlayerActiveRoom,
    listRooms: listJoinableNigoichiRooms,
    presentRoom: sanitizeNigoichiRoom,
  },
  create: ({ roomDraft, session }) => createStoredNigoichiRoom(roomDraft, session.id),
  command: ({ code, action }) => applyStoredNigoichiAction(code, action as NigoichiRoomAction),
  delete: {
    room: ({ code, session }) => deleteStoredNigoichiRoom(code, session.id),
    hosted: ({ ownerId, session }) => deleteHostedNigoichiRooms(ownerId, session.id),
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
