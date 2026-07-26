import {
  isSdkPreviewGrant,
  type SdkPreviewGrant,
} from "@game-fields/sdk-preview-auth";

const MAX_TOKEN_LENGTH = 2_048;

export class PreviewGrantVerifierError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "PreviewGrantVerifierError";
  }
}

export function sdkPortalGrantVerifierUrl(
  env: NodeJS.ProcessEnv = process.env,
) {
  const baseUrl = env.SDK_PORTAL_INTERNAL_URL?.replace(/\/$/, "")
    ?? (
      env.VERCEL_GIT_COMMIT_REF === "main"
        ? "https://sdk.game-fields.com"
        : "https://sdk-dev.game-fields.com"
    );
  return `${baseUrl}/api/preview-token/verify`;
}

export async function verifyPortalPreviewGrant(
  token: string,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchVerifier?: typeof fetch;
    now?: number;
  } = {},
): Promise<SdkPreviewGrant | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const verifierUrl = sdkPortalGrantVerifierUrl(options.env);
  let response: Response;
  try {
    response = await (options.fetchVerifier ?? fetch)(verifierUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
  } catch {
    throw new PreviewGrantVerifierError(
      "SDK_PREVIEW_GRANT_VERIFIER_UNAVAILABLE",
    );
  }
  if (response.status === 403) return null;
  if (!response.ok) {
    throw new PreviewGrantVerifierError(
      "SDK_PREVIEW_GRANT_VERIFIER_UNAVAILABLE",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PreviewGrantVerifierError(
      "SDK_PREVIEW_GRANT_VERIFIER_INVALID",
    );
  }
  const grant = payload && typeof payload === "object"
    ? (payload as { grant?: unknown }).grant
    : null;
  if (
    !isSdkPreviewGrant(grant)
    || grant.expiresAt <= (options.now ?? Date.now())
  ) {
    throw new PreviewGrantVerifierError(
      "SDK_PREVIEW_GRANT_VERIFIER_INVALID",
    );
  }
  return grant;
}
