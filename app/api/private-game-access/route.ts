import { cookies } from "next/headers";
import { privateGameCookieMatches, privateGameCookieName, privateGameCookieValue, privateGameKeyMatches } from "@/lib/private-game-access";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

export async function GET() {
  const store = await cookies();
  return Response.json({ unlocked: privateGameCookieMatches(store.get(privateGameCookieName)?.value) });
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/private-game-access", { operation: "private-game-access" });
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.accessAuth);
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  if (!privateGameKeyMatches(body?.key)) {
    telemetry.reject("auth.access", 403, { action: "unlock-private-games", errorCode: "INVALID_CREDENTIAL" });
    return Response.json({ unlocked: false }, { status: 403 });
  }
  const store = await cookies();
  store.set(privateGameCookieName, privateGameCookieValue(), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 2592000,
  });
  telemetry.success("auth.access", { action: "unlock-private-games" });
  return Response.json({ unlocked: true });
}

export async function DELETE(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/private-game-access", { operation: "private-game-access" });
  const store = await cookies();
  store.set(privateGameCookieName, "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0,
  });
  telemetry.success("auth.access", { action: "lock-private-games" });
  return Response.json({ unlocked: false });
}
