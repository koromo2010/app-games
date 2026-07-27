import { createSdkAccountLinkCode } from "./sdk-account-link.ts";

type SdkPortalEnvironment = {
  SDK_PORTAL_INTERNAL_URL?: string;
  VERCEL_GIT_COMMIT_REF?: string;
};

export function sdkPortalInternalBaseUrl(
  env: SdkPortalEnvironment = {
    SDK_PORTAL_INTERNAL_URL: process.env.SDK_PORTAL_INTERNAL_URL,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
  },
) {
  return env.SDK_PORTAL_INTERNAL_URL?.replace(/\/$/, "")
    ?? (env.VERCEL_GIT_COMMIT_REF === "main"
      ? "https://sdk.game-fields.com"
      : "https://sdk-dev.game-fields.com");
}

export function sdkDashboardHrefForAccess(input: {
  href: string | undefined;
  isLoggedIn: boolean;
  isCreatorOwner: boolean;
}) {
  return input.href && input.isLoggedIn && input.isCreatorOwner
    ? input.href
    : undefined;
}

export async function checkSdkCreatorOwnership(input: {
  creatorSlug: string;
  playerId: string;
  portalBaseUrl?: string;
  fetchImpl?: typeof fetch;
}) {
  const portalBaseUrl = input.portalBaseUrl ?? sdkPortalInternalBaseUrl();
  const portalOrigin = new URL(portalBaseUrl).origin;
  const proof = createSdkAccountLinkCode({
    playerId: input.playerId,
    audience: portalOrigin,
    expiresAt: Date.now() + 60_000,
  });
  const response = await (input.fetchImpl ?? fetch)(
    `${portalBaseUrl}/api/preview-owner/${encodeURIComponent(input.creatorSlug)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${proof}` },
      cache: "no-store",
    },
  );
  if (!response.ok) return false;
  const payload = await response.json() as { owner?: unknown };
  return payload.owner === true;
}
