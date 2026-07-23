import type { Player, Room, RoomChoice, WordWolfRoomAction } from "@/lib/wordwolf-game-types";
import {
  applyStoredWordWolfRoomAction,
  createStoredWordWolfRoom,
  deleteStoredHostedWordWolfRooms,
  deleteStoredWordWolfRoom,
  joinStoredWordWolfRoom,
  listStoredJoinableWordWolfRooms,
  loadStoredPlayerActiveRoom,
  loadStoredWordWolfRoom,
  sanitizeWordWolfRoom,
} from "@/lib/wordwolf-room-store";
import { createOnlineRoomErrorResponder } from "@/lib/online-room-route-errors";
import { createOnlineRoomRouteHandlers } from "@/lib/online-room-route-factory";

const errorResponse = createOnlineRoomErrorResponder({
  errors: {
    INVALID_WORDWOLF_ROOM: { error: "Invalid room", status: 400 },
    WORDWOLF_BAD_PASSPHRASE: { error: "Bad passphrase", status: 401 },
    WORDWOLF_ROOM_NOT_FOUND: { error: "Room not found", status: 404 },
    WORDWOLF_ROOM_FORBIDDEN: { error: "Room action is not allowed", status: 403 },
    WORDWOLF_ROOM_CONFLICT: { error: "Room update conflicted; retry", status: 409 },
    WORDWOLF_PLAYER_ALREADY_ACTIVE: { error: "Finish or leave the current room before entering another room", status: 409 },
    WORDWOLF_ROOM_STARTED: { error: "Room already started", status: 409 },
    WORDWOLF_ROOM_FULL: { error: "Room is full", status: 409 },
    WORDWOLF_ROOM_IN_PROGRESS: { error: "An active game cannot be dissolved", status: 409 },
  },
});

const handlers = createOnlineRoomRouteHandlers<Room, RoomChoice>({
  gameId: "wordwolf",
  route: "/api/wordwolf/rooms",
  errorResponse,
  read: {
    loadRoom: loadStoredWordWolfRoom,
    loadActiveRoom: loadStoredPlayerActiveRoom,
    listRooms: listStoredJoinableWordWolfRooms,
    presentRoom: sanitizeWordWolfRoom,
  },
  create: ({ roomDraft, session }) => createStoredWordWolfRoom(roomDraft, session.id),
  command: ({ code, action, session }) => action.type === "join-room"
    ? joinStoredWordWolfRoom(
        code,
        action.player as Player,
        typeof action.passphrase === "string" ? action.passphrase : "",
      )
    : applyStoredWordWolfRoomAction(code, session.id, action as unknown as WordWolfRoomAction),
  delete: {
    room: async ({ code, session }) => {
      const room = await loadStoredWordWolfRoom(code);
      if (room && room.hostId !== session.id) throw new Error("WORDWOLF_ROOM_FORBIDDEN");
      await deleteStoredWordWolfRoom(code);
    },
    hosted: ({ session }) => deleteStoredHostedWordWolfRooms(session.id),
    forbiddenMessage: "Room delete is not allowed",
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
