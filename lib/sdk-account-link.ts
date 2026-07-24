import { createHmac, timingSafeEqual } from "node:crypto";

export type SdkAccountLinkPayload = {
  playerId: string;
  playerName?: string;
  audience: string;
  expiresAt: number;
};

export type SdkPreviewAccountLinkPayload = SdkAccountLinkPayload & {
  purpose: "sdk-preview-resource";
  creatorSlug: string;
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

export function parseSdkAccountLinkCode<
  Payload extends SdkAccountLinkPayload = SdkAccountLinkPayload,
>(value: string): Payload | null {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const actual = Buffer.from(signature, "base64url");
  const expected = Buffer.from(sign(encoded), "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Payload;
    if (!payload.playerId || !payload.audience || !Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseSdkPreviewAccountLinkCode(
  value: string,
  expected: {
    audience: string;
    creatorSlug: string;
  },
): SdkPreviewAccountLinkPayload | null {
  const payload = parseSdkAccountLinkCode<SdkPreviewAccountLinkPayload>(value);
  if (
    payload?.purpose !== "sdk-preview-resource"
    || payload.audience !== expected.audience
    || payload.creatorSlug !== expected.creatorSlug
  ) {
    return null;
  }
  return payload;
}
