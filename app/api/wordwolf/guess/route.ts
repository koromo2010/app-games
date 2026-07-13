import { createRequestTelemetry } from "@/lib/observability";

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/guess", { game: "wordwolf", operation: "legacy-guess" });
  telemetry.reject("game.command", 410, { action: "submit-guess", errorCode: "LEGACY_ENDPOINT_REMOVED" });
  return Response.json(
    { error: "Guess judgement must be submitted through the authenticated room command" },
    { status: 410 },
  );
}
