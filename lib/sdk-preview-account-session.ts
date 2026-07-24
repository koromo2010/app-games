import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import {
  createSdkAccountLinkCode,
  parseSdkAccountLinkCode,
  type SdkAccountLinkPayload,
} from "@/lib/sdk-account-link";
import { getAuthenticatedPlayer } from "@/lib/player-auth";

const sdkPreviewSessionMaxAgeSeconds = 8 * 60 * 60;

type SdkPreviewAccountSessionPayload = SdkAccountLinkPayload & {
  purpose: "sdk-preview-session";
  creatorSlug: string;
};

function sessionAudience(creatorSlug: string) {
  return `game-fields-sdk-preview:${creatorSlug}`;
}

export function sdkPreviewAccountCookieName(creatorSlug: string) {
  const scope = createHash("sha256")
    .update(creatorSlug)
    .digest("base64url")
    .slice(0, 16);
  return `game-fields-sdk-preview-${scope}`;
}

export async function setSdkPreviewAccountSession(input: {
  playerId: string;
  creatorSlug: string;
}) {
  const expiresAt = Date.now() + sdkPreviewSessionMaxAgeSeconds * 1_000;
  const payload = {
    playerId: input.playerId,
    audience: sessionAudience(input.creatorSlug),
    creatorSlug: input.creatorSlug,
    purpose: "sdk-preview-session",
    expiresAt,
  } satisfies SdkPreviewAccountSessionPayload;
  (await cookies()).set(
    sdkPreviewAccountCookieName(input.creatorSlug),
    createSdkAccountLinkCode(payload),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/sdk-preview",
      maxAge: sdkPreviewSessionMaxAgeSeconds,
    },
  );
}

export async function getSdkPreviewAccountPlayerId(creatorSlug: string) {
  const value = (await cookies()).get(
    sdkPreviewAccountCookieName(creatorSlug),
  )?.value;
  if (!value) return null;
  const payload = parseSdkAccountLinkCode<SdkPreviewAccountSessionPayload>(
    value,
  );
  if (
    payload?.purpose !== "sdk-preview-session"
    || payload.creatorSlug !== creatorSlug
    || payload.audience !== sessionAudience(creatorSlug)
  ) {
    return null;
  }
  return payload.playerId;
}

export async function requireSdkPreviewAuthenticatedPlayer(
  creatorSlug: string,
) {
  const player = await getAuthenticatedPlayer();
  if (player?.id) {
    return {
      id: player.id,
      name: player.name,
      source: "player-session" as const,
    };
  }
  const playerId = await getSdkPreviewAccountPlayerId(creatorSlug);
  if (!playerId) throw new Error("PLAYER_AUTH_REQUIRED");
  return {
    id: playerId,
    name: null,
    source: "sdk-preview-session" as const,
  };
}
