import { createHmac, timingSafeEqual } from "node:crypto";

export type SdkAccountLinkPayload = {
  playerId: string;
  audience: string;
  expiresAt: number;
};

function secret() {
  const value = process.env.SDK_ACCOUNT_LINK_SECRET;
  if (!value || value.length < 32) throw new Error("SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSdkAccountLinkCode(payload: SdkAccountLinkPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function parseSdkAccountLinkCode(value: string): SdkAccountLinkPayload | null {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const actual = Buffer.from(signature, "base64url");
  const expected = Buffer.from(sign(encoded), "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SdkAccountLinkPayload;
    if (!payload.playerId || !payload.audience || !Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
