import { judgeWordWolfGuess } from "@/lib/wordwolf-guess-judgement";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { guess?: unknown; correct?: unknown };
    const guess = typeof body.guess === "string" ? body.guess.trim() : "";
    const correct = typeof body.correct === "string" ? body.correct.trim() : "";

    if (!guess || !correct) {
      return Response.json({ error: "guess and correct are required" }, { status: 400 });
    }

    const judgement = await judgeWordWolfGuess(guess, correct);
    return Response.json({ judgement });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Guess feedback storage is not configured" }, { status: 503 });
    }

    return Response.json({ error: "Failed to judge guess" }, { status: 500 });
  }
}
