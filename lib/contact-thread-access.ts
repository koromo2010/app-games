import { createHmac, timingSafeEqual } from "node:crypto";

function contactThreadSecret() {
  const value = process.env.PLAYER_SESSION_SECRET
    || process.env.LLM_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("PLAYER_SESSION_SECRET_NOT_CONFIGURED");
  }
  return value;
}

export function createContactThreadToken(contactId: string) {
  return createHmac("sha256", contactThreadSecret())
    .update(`game-fields-contact-thread:${contactId}`)
    .digest("base64url");
}

export function verifyContactThreadToken(contactId: string, token: string) {
  if (!/^contact_[0-9a-f-]{36}$/i.test(contactId) || !token) return false;
  const supplied = Buffer.from(token, "base64url");
  const expected = Buffer.from(
    createContactThreadToken(contactId),
    "base64url",
  );
  return supplied.length === expected.length
    && timingSafeEqual(supplied, expected);
}
