import { generateTahoiyaTopicResponse } from "@/app/api/tahoiya/topic/route";
import { withGameGenerationCache } from "@/lib/game-generation-cache";
import type { OnlineRoomCommandContext } from "@/lib/online-room-route-factory";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import {
  applyStoredTahoiyaRoomAction,
  beginStoredTahoiyaTopicGeneration,
  clearStoredTahoiyaTopicGeneration,
  joinStoredTahoiyaRoom,
  loadStoredTahoiyaRoom,
  startStoredTahoiyaRound,
  updateStoredTahoiyaTopicGeneration,
} from "@/lib/tahoiya-room-store";
import type { TahoiyaRoom, TahoiyaRoomAction, TahoiyaTopic } from "@/lib/tahoiya-types";

export async function applyTahoiyaRoomRouteCommand({
  request,
  session,
  telemetry,
  code,
  action,
}: OnlineRoomCommandContext<TahoiyaRoom>) {
  if (action.type === "join-room") {
    return joinStoredTahoiyaRoom(
      code,
      action.player as TahoiyaRoom["players"][number],
      typeof action.passphrase === "string" ? action.passphrase : "",
    );
  }
  if (action.type !== "start-round") {
    return applyStoredTahoiyaRoomAction(code, action as TahoiyaRoomAction);
  }

  const current = await loadStoredTahoiyaRoom(code);
  if (!current) throw new Error("TAHOIYA_ROOM_NOT_FOUND");
  if (current.hostId !== session.id || current.phase !== "lobby") throw new Error("TAHOIYA_ROOM_FORBIDDEN");
  if (!current.debugMode && current.players.length < 2) throw new Error("TAHOIYA_NOT_ENOUGH_PLAYERS");
  const aiLimited = await rateLimitResponseFor(request, rateLimitPolicies.aiGeneration, { playerId: session.id });
  if (aiLimited) return aiLimited;

  const generation = await beginStoredTahoiyaTopicGeneration(code, session.id);
  let roundStarted = false;
  try {
    const generationRoom = generation.room;
    const generated = await withGameGenerationCache(
      "tahoiya-screening-first-v1",
      `${generationRoom.code}:${generationRoom.round}:${generationRoom.topicDifficulty}`,
      async () => {
        const response = await generateTahoiyaTopicResponse(
          generationRoom.topicDifficulty,
          generationRoom.players.map((player) => player.id),
          false,
          false,
          async (progress) => {
            await updateStoredTahoiyaTopicGeneration(code, generation.generationId, progress);
          },
        );
        return {
          status: response.status,
          body: await response.json() as TahoiyaTopic & { error?: string; errorCode?: string },
        };
      },
      { shouldCache: (result) => result.status < 400 },
    );
    const topic = generated.body;
    if (generated.status >= 400 || !topic.word || !topic.realDefinition) {
      telemetry.reject("room.command", generated.status, {
        action: "start-round",
        roomRef: telemetry.roomRef(code),
        actorRef: telemetry.actorRef(session.id),
      });
      return Response.json(
        { error: topic.error || "Topic generation failed", errorCode: topic.errorCode },
        { status: generated.status },
      );
    }
    await updateStoredTahoiyaTopicGeneration(code, generation.generationId, { stage: "finalizing" });
    const room = await startStoredTahoiyaRound(code, session.id, topic, generation.generationId);
    roundStarted = true;
    return room;
  } finally {
    if (!roundStarted) {
      await clearStoredTahoiyaTopicGeneration(code, generation.generationId).catch(() => undefined);
    }
  }
}
