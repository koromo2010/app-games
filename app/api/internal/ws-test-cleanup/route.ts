import { clearPlayerAuthCookie, getAuthenticatedPlayer } from "@/lib/player-auth";
import { deletePostgresPlayerAccount } from "@/lib/player-account-postgres-store";
import { normalizeAccountName } from "@/lib/player-account-store";
import { redisCommand } from "@/lib/redis-store";

export const runtime = "nodejs";

const targets = new Map([
  ["70cd4a95-1b89-418a-9777-cd3c34626d1c", "ws検証A-rt6ky0i"],
  ["8c205444-1d09-4ecd-a67b-31cd1e21e25f", "ws検証B-rt6ky0i"],
]);

export async function POST() {
  if (process.env.VERCEL_ENV !== "preview") return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const session = await getAuthenticatedPlayer();
  const expectedName = session?.id ? targets.get(session.id) : null;
  if (!session?.id || !expectedName || session.name !== expectedName) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  await deletePostgresPlayerAccount(session.id);
  await redisCommand<number>(["DEL", `player-account:${normalizeAccountName(expectedName)}`, `player:${session.id}`]);
  await clearPlayerAuthCookie();
  return Response.json({ ok: true });
}
