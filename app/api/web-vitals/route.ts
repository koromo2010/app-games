import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { normalizeWebVitalInput } from "@/lib/web-vitals";
import { recordWebVital } from "@/lib/web-vitals-store";

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/web-vitals", { operation: "web-vital-report" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation);
  if (limited) return limited;
  try {
    const body = await request.json();
    if (!normalizeWebVitalInput(body)) return Response.json({ error: "INVALID_WEB_VITAL" }, { status: 400 });
    await recordWebVital(body);
    telemetry.success("site.web-vital", { action: "record" });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    telemetry.failure("site.web-vital", error, 500, { action: "record" });
    return Response.json({ error: "WEB_VITAL_RECORD_FAILED" }, { status: 500 });
  }
}
