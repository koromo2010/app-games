import { normalizeGameGenerationMeta } from "@/lib/game-ai-types";
import { loadGameFeedback, saveGameFeedback } from "@/lib/game-feedback-store";

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const artifactId = cleanString(url.searchParams.get("artifactId"), 200);
  const playerId = cleanString(url.searchParams.get("playerId"), 100);
  if (!artifactId || !playerId) return Response.json({ feedback: null });

  try {
    return Response.json({ feedback: await loadGameFeedback(artifactId, playerId) });
  } catch {
    return Response.json({ feedback: null });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const generation = normalizeGameGenerationMeta(body.generation);
  const rating = body.rating === "good" || body.rating === "bad" ? body.rating : null;
  const artifactId = cleanString(body.artifactId, 200);
  const playerId = cleanString(body.playerId, 100);
  const game = cleanString(body.game, 50);
  const task = cleanString(body.task, 80);
  if (!generation || !rating || !artifactId || !playerId || !game || !task) {
    return Response.json({ error: "Missing feedback fields." }, { status: 400 });
  }

  try {
    const feedback = await saveGameFeedback({
      artifactId,
      artifactText: cleanString(body.artifactText, 1200),
      game,
      task,
      rating,
      reasonTags: Array.isArray(body.reasonTags)
        ? body.reasonTags.map((tag) => cleanString(tag, 80)).filter(Boolean).slice(0, 8)
        : [],
      comment: cleanString(body.comment, 800),
      playerId,
      generation,
      settings: body.settings && typeof body.settings === "object"
        ? body.settings as Record<string, string | number | boolean>
        : {},
      outcome: body.outcome && typeof body.outcome === "object"
        ? body.outcome as Record<string, string | number | boolean>
        : {},
    });
    return Response.json({ feedback });
  } catch (error) {
    console.error("[game-feedback] failed to save feedback", error);
    return Response.json({ error: "Feedback could not be saved." }, { status: 503 });
  }
}
