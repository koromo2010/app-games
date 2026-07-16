import { createRequestTelemetry } from "@/lib/observability";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";

export async function POST(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("wordwolf");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/guess", { game: "wordwolf", operation: "legacy-guess" });
  telemetry.reject("game.command", 410, { action: "submit-guess", errorCode: "LEGACY_ENDPOINT_REMOVED" });
  return Response.json(
    { error: "Guess judgement must be submitted through the authenticated room command" },
    { status: 410 },
  );
}
