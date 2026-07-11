import { recordWordWolfGuessFeedback } from "@/lib/wordwolf-guess-judgement";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { guess?: unknown; correct?: unknown; accepted?: unknown };
    const guess = typeof body.guess === "string" ? body.guess.trim() : "";
    const correct = typeof body.correct === "string" ? body.correct.trim() : "";

    if (!guess || !correct || typeof body.accepted !== "boolean") {
      return Response.json({ error: "guess, correct and accepted are required" }, { status: 400 });
    }

    const feedback = await recordWordWolfGuessFeedback(guess, correct, body.accepted);
    return Response.json({ feedback });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Guess feedback storage is not configured" }, { status: 503 });
    }

    return Response.json({ error: "Failed to save guess feedback" }, { status: 500 });
  }
}
