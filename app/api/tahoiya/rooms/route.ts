import { applyTahoiyaRoomRouteCommand } from "@/app/api/tahoiya/rooms/application";
import {
  createStoredTahoiyaRoom,
  deleteStoredHostedTahoiyaRooms,
  deleteStoredTahoiyaRoom,
  listStoredJoinableTahoiyaRooms,
  loadAndReconcileStoredTahoiyaRoom,
  loadStoredTahoiyaPlayerActiveRoom,
  sanitizeTahoiyaRoom,
} from "@/lib/tahoiya-room-store";
import type { TahoiyaRoom, TahoiyaRoomChoice } from "@/lib/tahoiya-types";
import { createOnlineRoomErrorResponder } from "@/lib/online-room-route-errors";
import { createOnlineRoomRouteHandlers } from "@/lib/online-room-route-factory";

const errorResponse = createOnlineRoomErrorResponder({
  errors: {
    INVALID_TAHOIYA_ROOM: { error: "Invalid room", status: 400 },
    TAHOIYA_ROOM_NOT_FOUND: { error: "Room not found", status: 404 },
    TAHOIYA_BAD_PASSPHRASE: { error: "Bad passphrase", status: 401 },
    TAHOIYA_ROOM_FORBIDDEN: { error: "Room action is not allowed", status: 403 },
    TAHOIYA_ROOM_CONFLICT: { error: "Room update conflicted; retry the action", status: 409 },
    TAHOIYA_PLAYER_ALREADY_ACTIVE: { error: "Finish or leave the current room before entering another room", status: 409 },
    TAHOIYA_ROOM_IN_PROGRESS: { error: "An active game cannot be dissolved", status: 409 },
    TAHOIYA_TOPIC_GENERATION_IN_PROGRESS: { error: "Topic generation is still in progress", status: 409 },
    GAME_GENERATION_IN_PROGRESS: { error: "Topic generation is still in progress", status: 409 },
    TAHOIYA_PLAYERS_NOT_RETURNED: { error: "復帰待ちの参加者がいます。全員が戻ってから開始してください。", status: 409 },
    TAHOIYA_ROOM_FULL: { error: "TAHOIYA_ROOM_FULL", status: 409 },
    TAHOIYA_ROOM_STARTED: { error: "TAHOIYA_ROOM_STARTED", status: 409 },
    TAHOIYA_NOT_ENOUGH_PLAYERS: { error: "TAHOIYA_NOT_ENOUGH_PLAYERS", status: 409 },
    TAHOIYA_ANSWERER_REQUIRED: { error: "TAHOIYA_ANSWERER_REQUIRED", status: 409 },
  },
});

const handlers = createOnlineRoomRouteHandlers<TahoiyaRoom, TahoiyaRoomChoice>({
  gameId: "tahoiya",
  route: "/api/tahoiya/rooms",
  errorResponse,
  read: {
    loadRoom: loadAndReconcileStoredTahoiyaRoom,
    loadActiveRoom: loadStoredTahoiyaPlayerActiveRoom,
    listRooms: listStoredJoinableTahoiyaRooms,
    presentRoom: sanitizeTahoiyaRoom,
  },
  create: ({ roomDraft, session }) => createStoredTahoiyaRoom(roomDraft, session.id),
  command: applyTahoiyaRoomRouteCommand,
  delete: {
    room: ({ code, session }) => deleteStoredTahoiyaRoom(code, session.id),
    hosted: ({ session }) => deleteStoredHostedTahoiyaRooms(session.id),
    forbiddenMessage: "Room delete is not allowed",
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
