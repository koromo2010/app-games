import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "game-fields-sdk-account";
const stateCookieName = "game-fields-sdk-link-state";
const maxAgeSeconds = 30 * 24 * 60 * 60;

export type SdkAccountSession = { playerId: string; playerName: string | null; expiresAt: number };
type LinkPayload = { playerId: string; playerName?: string; audience: string; expiresAt: number };

function secret() {
  const value = process.env.SDK_ACCOUNT_LINK_SECRET;
  if (!value || value.length < 32) throw new Error("SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED");
  return value;
}

function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function parseSigned<T>(value: string): T | null {
  const [encoded, provided] = value.split(".");
  if (!encoded || !provided) return null;
  const actual = Buffer.from(provided, "base64url");
  const expected = Buffer.from(signature(encoded), "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try { return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T; } catch { return null; }
}

function createSigned(payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyAccountLinkCode(code: string, audience: string): Omit<SdkAccountSession, "expiresAt"> | null {
  const payload = parseSigned<LinkPayload>(code);
  if (!payload?.playerId || payload.audience !== audience || payload.expiresAt < Date.now()) return null;
  return {
    playerId: payload.playerId,
    playerName: typeof payload.playerName === "string" && payload.playerName.trim() ? payload.playerName.trim().slice(0, 40) : null,
  };
}

export async function setSdkAccountSession(account: Omit<SdkAccountSession, "expiresAt">) {
  const store = await cookies();
  store.set(cookieName, createSigned({ ...account, expiresAt: Date.now() + maxAgeSeconds * 1000 }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: maxAgeSeconds,
  });
}

export async function getSdkAccountSession(): Promise<SdkAccountSession | null> {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) return null;
  const payload = parseSigned<SdkAccountSession>(value);
  if (!payload?.playerId || payload.expiresAt < Date.now()) return null;
  return {
    playerId: payload.playerId,
    playerName: typeof payload.playerName === "string" && payload.playerName.trim() ? payload.playerName : null,
    expiresAt: payload.expiresAt,
  };
}

export async function getSdkAccountPlayerId() {
  return (await getSdkAccountSession())?.playerId ?? null;
}

export async function clearSdkAccountSession() {
  (await cookies()).set(cookieName, "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0,
  });
}

export async function setAccountLinkState(state: string) {
  (await cookies()).set(stateCookieName, state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/account-link", maxAge: 5 * 60,
  });
}

export async function consumeAccountLinkState(state: string) {
  const store = await cookies();
  const expected = store.get(stateCookieName)?.value ?? "";
  store.set(stateCookieName, "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/account-link", maxAge: 0,
  });
  if (!expected || !state) return false;
  const actualBytes = Buffer.from(state);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
