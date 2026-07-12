import { createHash, timingSafeEqual } from "node:crypto";

export const privateGameCookieName = "app-games-private-access";

function configuredKey() {
  return process.env.PRIVATE_GAME_ACCESS_KEY?.trim() ?? "";
}

export function privateGameCookieValue() {
  const key = configuredKey();
  return key ? createHash("sha256").update(key).digest("hex") : "";
}

export function privateGameKeyMatches(input: unknown) {
  const expected = configuredKey();
  const candidate = typeof input === "string" ? input : "";
  if (!expected || expected.length !== candidate.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
}

export function privateGameCookieMatches(value: string | undefined) {
  const expected = privateGameCookieValue();
  return Boolean(expected && value === expected);
}
