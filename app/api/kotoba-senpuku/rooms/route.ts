import type { KotobaSenpukuRoom, KotobaSenpukuRoomAction, KotobaSenpukuRoomChoice } from "@/lib/kotoba-senpuku";
import {
  applyStoredKotobaSenpukuAction,
  createStoredKotobaSenpukuRoom,
  deleteHostedKotobaSenpukuRooms,
  deleteStoredKotobaSenpukuRoom,
  listJoinableKotobaSenpukuRooms,
  loadAndReconcileKotobaSenpukuRoom,
  loadKotobaSenpukuPlayerActiveRoom,
  sanitizeKotobaSenpukuRoom,
} from "@/lib/kotoba-senpuku-room-store";
import { createOnlineRoomErrorResponder } from "@/lib/online-room-route-errors";
import { createOnlineRoomRouteHandlers } from "@/lib/online-room-route-factory";

const errorResponse = createOnlineRoomErrorResponder({
  errors: {
    KOTOBA_SENPUKU_ROOM_NOT_FOUND: { error: "Room not found", status: 404 },
    KOTOBA_SENPUKU_BAD_PASSPHRASE: { error: "Bad passphrase", status: 401 },
    KOTOBA_SENPUKU_ROOM_FULL: { error: "Room is full", status: 409 },
    KOTOBA_SENPUKU_NOT_ENOUGH_PLAYERS: { error: "Not enough players", status: 409 },
    KOTOBA_SENPUKU_ROOM_IN_PROGRESS: { error: "An active game cannot be dissolved", status: 409 },
    KOTOBA_SENPUKU_PLAYER_ALREADY_ACTIVE: { error: "Finish or leave the current room before entering another room", status: 409 },
    KOTOBA_SENPUKU_NOT_YOUR_TURN: { error: "Room action is not allowed", status: 403 },
    KOTOBA_SENPUKU_ROOM_FORBIDDEN: { error: "Room action is not allowed", status: 403 },
    KOTOBA_SENPUKU_INVALID_WORD: { error: "Invalid secret word", status: 400 },
    KOTOBA_SENPUKU_WORD_TOO_SHORT: { error: "Secret word is too short", status: 400 },
    KOTOBA_SENPUKU_INVALID_KANA: { error: "Invalid battle action", status: 400 },
    KOTOBA_SENPUKU_INVALID_TARGET: { error: "Invalid battle action", status: 400 },
    KOTOBA_SENPUKU_ROOM_CONFLICT: { error: "Room update conflicted; retry", status: 409 },
    INVALID_KOTOBA_SENPUKU_ROOM: { error: "Invalid room", status: 400 },
  },
});

const handlers = createOnlineRoomRouteHandlers<KotobaSenpukuRoom, KotobaSenpukuRoomChoice>({
  gameId: "kotoba-senpuku",
  route: "/api/kotoba-senpuku/rooms",
  errorResponse,
  read: {
    loadRoom: loadAndReconcileKotobaSenpukuRoom,
    loadActiveRoom: loadKotobaSenpukuPlayerActiveRoom,
    listRooms: listJoinableKotobaSenpukuRooms,
    presentRoom: sanitizeKotobaSenpukuRoom,
  },
  create: ({ roomDraft, session }) => createStoredKotobaSenpukuRoom(roomDraft, session.id),
  command: ({ code, action }) => applyStoredKotobaSenpukuAction(code, action as KotobaSenpukuRoomAction),
  delete: {
    room: ({ code, session }) => deleteStoredKotobaSenpukuRoom(code, session.id),
    hosted: ({ ownerId, session }) => deleteHostedKotobaSenpukuRooms(ownerId, session.id),
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
