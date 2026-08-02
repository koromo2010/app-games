import "server-only";

import { createSdkAccountLinkCode } from "./sdk-account-link.ts";
import { sdkPortalInternalBaseUrl } from "./sdk-dashboard-navigation.ts";

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
