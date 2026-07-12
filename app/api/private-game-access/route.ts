import { cookies } from "next/headers";
import { privateGameCookieMatches, privateGameCookieName, privateGameCookieValue, privateGameKeyMatches } from "@/lib/private-game-access";

export async function GET() {
  const store = await cookies();
  return Response.json({ unlocked: privateGameCookieMatches(store.get(privateGameCookieName)?.value) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  if (!privateGameKeyMatches(body?.key)) return Response.json({ unlocked: false }, { status: 403 });
  const store = await cookies();
  store.set(privateGameCookieName, privateGameCookieValue(), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 2592000,
  });
  return Response.json({ unlocked: true });
}
