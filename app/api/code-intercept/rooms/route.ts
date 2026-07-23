import {
  applyStoredCodeInterceptAction,
  createStoredCodeInterceptRoom,
  deleteHostedCodeInterceptRooms,
  deleteStoredCodeInterceptRoom,
  listJoinableCodeInterceptRooms,
  loadCodeInterceptPlayerActiveRoom,
  loadStoredCodeInterceptRoom,
  sanitizeCodeInterceptRoom,
} from "@/lib/code-intercept-room-store";
import type { CodeInterceptRoom, CodeInterceptRoomAction, CodeInterceptRoomChoice } from "@/lib/code-intercept";
import { createOnlineRoomErrorResponder } from "@/lib/online-room-route-errors";
import { createOnlineRoomRouteHandlers } from "@/lib/online-room-route-factory";

const errorResponse = createOnlineRoomErrorResponder({
  errors: {
    CODE_INTERCEPT_ROOM_NOT_FOUND: { error: "Room not found", status: 404 },
    CODE_INTERCEPT_BAD_PASSPHRASE: { error: "Bad passphrase", status: 401 },
    CODE_INTERCEPT_ROOM_FULL: { error: "Room is full", status: 409 },
    CODE_INTERCEPT_NOT_ENOUGH_PLAYERS: { error: "Each team needs at least two players and team sizes may differ by at most one", status: 409 },
    CODE_INTERCEPT_WORDS_UNAVAILABLE: {
      error: "General Game Poolから設定した難易度の単語を取得できませんでした。",
      errorCode: "CODE_INTERCEPT_WORDS_UNAVAILABLE",
      status: 503,
    },
    CODE_INTERCEPT_ROOM_IN_PROGRESS: { error: "An active game cannot be dissolved", status: 409 },
    CODE_INTERCEPT_PLAYER_ALREADY_ACTIVE: { error: "Finish or leave the current room before entering another room", status: 409 },
    CODE_INTERCEPT_INVALID_CLUE: { error: "Invalid game input", status: 400 },
    CODE_INTERCEPT_INVALID_ANSWER: { error: "Invalid game input", status: 400 },
    CODE_INTERCEPT_INVALID_CONFIG: { error: "Invalid game input", status: 400 },
    CODE_INTERCEPT_INVALID_CODE_LENGTH: { error: "Invalid game input", status: 400 },
    CODE_INTERCEPT_ROOM_FORBIDDEN: { error: "Room action is not allowed", status: 403 },
    CODE_INTERCEPT_ROOM_CONFLICT: { error: "Room update conflicted; retry", status: 409 },
    INVALID_CODE_INTERCEPT_ROOM: { error: "Invalid room", status: 400 },
  },
});

const handlers = createOnlineRoomRouteHandlers<CodeInterceptRoom, CodeInterceptRoomChoice>({
  gameId: "code-intercept",
  route: "/api/code-intercept/rooms",
  errorResponse,
  read: {
    loadRoom: loadStoredCodeInterceptRoom,
    loadActiveRoom: loadCodeInterceptPlayerActiveRoom,
    listRooms: listJoinableCodeInterceptRooms,
    presentRoom: sanitizeCodeInterceptRoom,
  },
  create: ({ roomDraft, session }) => createStoredCodeInterceptRoom(roomDraft, session.id),
  command: ({ code, action }) => applyStoredCodeInterceptAction(code, action as CodeInterceptRoomAction),
  delete: {
    room: ({ code, session }) => deleteStoredCodeInterceptRoom(code, session.id),
    hosted: ({ ownerId, session }) => deleteHostedCodeInterceptRooms(ownerId, session.id),
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
