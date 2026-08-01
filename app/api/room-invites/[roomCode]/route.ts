import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { loadSdkPreviewRoomInviteTarget } from "@/lib/sdk-preview-room-invite-index";
import { normalizeGameSdkPlatformRoomCode } from "@/lib/game-sdk-platform-room-store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ roomCode: string }> },
) {
  try {
    await requireAuthenticatedPlayer();
    const { roomCode } = await context.params;
    const code = normalizeGameSdkPlatformRoomCode(roomCode);
    const target = await loadSdkPreviewRoomInviteTarget(code);
    if (!target) {
      return Response.json({ target: null }, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return Response.json({
      target: {
        kind: "sdk-preview",
        roomCode: code,
        creatorSlug: target.creatorSlug,
        gameId: target.gameId,
        revision: target.revision,
        endpoint: `/api/sdk-preview/${encodeURIComponent(target.creatorSlug)}/games/${encodeURIComponent(target.gameId)}/rooms?revision=${encodeURIComponent(target.revision)}`,
        href: `/sdk-preview/${encodeURIComponent(target.creatorSlug)}/games/${encodeURIComponent(target.gameId)}?revision=${encodeURIComponent(target.revision)}&room=${encodeURIComponent(code)}`,
      },
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return Response.json(
      { error: code === "PLAYER_AUTH_REQUIRED" ? code : "ROOM_INVITE_LOOKUP_FAILED" },
      { status: code === "PLAYER_AUTH_REQUIRED" ? 401 : 400 },
    );
  }
}
