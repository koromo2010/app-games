import {
  verifySdkPreviewToken,
  type SdkPreviewGrant,
} from "@game-fields/sdk-preview-auth";

const MAX_TOKEN_LENGTH = 2_048;
const MAX_PUBLIC_KEY_RESPONSE_BYTES = 4 * 1024;
const PUBLIC_KEY_TIMEOUT_MS = 2_000;

type PreviewEnvironment = "production" | "development";
const pinnedPreviewPublicKeys = {
  production: "MCowBQYDK2VwAyEAAV6Uwh-eEJ9e2aIlzFtjKsuxT1INe-6kwrbAu3lFOYE",
  development: "",
} as const;

export class PreviewGrantVerifierError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "PreviewGrantVerifierError";
  }
}

function previewEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): PreviewEnvironment {
  return env.VERCEL_GIT_COMMIT_REF === "main"
    ? "production"
    : "development";
}

export function sdkPortalPublicKeyUrl(
  env: NodeJS.ProcessEnv = process.env,
) {
  const baseUrl = env.SDK_PORTAL_INTERNAL_URL?.replace(/\/$/, "")
    ?? (
      previewEnvironment(env) === "production"
        ? "https://sdk.game-fields.com"
        : "https://sdk-dev.game-fields.com"
    );
  return `${baseUrl}/.well-known/sdk-preview-public-key`;
}

let cachedPublicKeys: Partial<Record<PreviewEnvironment, string>> = {};

function validPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 256) {
    return false;
  }
  try {
    return Buffer.from(value, "base64url").length === 44;
  } catch {
    return false;
  }
}

async function fetchPortalPublicKey(
  environment: PreviewEnvironment,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchPublicKey?: typeof fetch;
  },
) {
  const response = await (options.fetchPublicKey ?? fetch)(
    sdkPortalPublicKeyUrl(options.env),
    {
      method: "GET",
      cache: "force-cache",
      redirect: "error",
      signal: AbortSignal.timeout(PUBLIC_KEY_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new PreviewGrantVerifierError(
      "SDK_PREVIEW_PUBLIC_KEY_UNAVAILABLE",
    );
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_PUBLIC_KEY_RESPONSE_BYTES) {
    throw new PreviewGrantVerifierError(
      "SDK_PREVIEW_PUBLIC_KEY_INVALID",
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new PreviewGrantVerifierError(
      "SDK_PREVIEW_PUBLIC_KEY_INVALID",
    );
  }
  const publicKey = payload && typeof payload === "object"
    ? (payload as {
      algorithm?: unknown;
      environment?: unknown;
      publicKey?: unknown;
      version?: unknown;
    })
    : null;
  if (
    !publicKey
    || publicKey.algorithm !== "Ed25519"
    || publicKey.environment !== environment
    || publicKey.version !== 4
    || !validPublicKey(publicKey.publicKey)
  ) {
    throw new PreviewGrantVerifierError(
      "SDK_PREVIEW_PUBLIC_KEY_INVALID",
    );
  }
  cachedPublicKeys[environment] = publicKey.publicKey;
  return publicKey.publicKey;
}

async function resolvePortalPublicKey(options: {
  env?: NodeJS.ProcessEnv;
  fetchPublicKey?: typeof fetch;
  publicKey?: string;
}) {
  if (options.publicKey !== undefined) {
    if (!validPublicKey(options.publicKey)) {
      throw new PreviewGrantVerifierError(
        "SDK_PREVIEW_PUBLIC_KEY_INVALID",
      );
    }
    return options.publicKey;
  }
  const environment = previewEnvironment(options.env);
  const pinned = pinnedPreviewPublicKeys[environment];
  if (validPublicKey(pinned)) return pinned;
  const cached = cachedPublicKeys[environment];
  if (validPublicKey(cached)) return cached;
  try {
    return await fetchPortalPublicKey(environment, options);
  } catch (error) {
    if (error instanceof PreviewGrantVerifierError) throw error;
    throw new PreviewGrantVerifierError(
      "SDK_PREVIEW_PUBLIC_KEY_UNAVAILABLE",
    );
  }
}

export async function verifyPortalPreviewGrant(
  token: string,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchPublicKey?: typeof fetch;
    now?: number;
    publicKey?: string;
  } = {},
): Promise<SdkPreviewGrant | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const environment = previewEnvironment(options.env);
  const publicKey = await resolvePortalPublicKey(options);
  const grant = verifySdkPreviewToken(
    token,
    publicKey,
    options.now ?? Date.now(),
  );
  if (!grant || grant.environment !== environment) return null;
  return grant;
}

export function resetPreviewPublicKeyCacheForTests() {
  cachedPublicKeys = {};
}
