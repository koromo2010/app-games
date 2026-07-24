import {
  verifySdkServiceAuthorization,
} from "@game-fields/sdk-preview-auth";

function serviceSecret() {
  const secret = process.env.SDK_ACCOUNT_LINK_SECRET ?? "";
  if (secret.length < 32) throw new Error("SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED");
  return secret;
}

export function requireSdkServiceRequest(request: Request) {
  const value = request.headers.get("x-game-fields-sdk-service") ?? "";
  const url = new URL(request.url);
  if (!verifySdkServiceAuthorization(value, {
    method: request.method,
    path: `${url.pathname}${url.search}`,
  }, serviceSecret())) {
    throw new Error("SDK_SERVICE_AUTH_REQUIRED");
  }
}
