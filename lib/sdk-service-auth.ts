import {
  createSdkServiceAuthorization,
  verifySdkServiceAuthorization,
} from "@game-fields/sdk-service-auth";

function serviceSecret() {
  const secret = process.env.SDK_ACCOUNT_LINK_SECRET ?? "";
  if (secret.length < 32) throw new Error("SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED");
  return secret;
}

export function sdkServiceHeaders(method: string, url: string) {
  const target = new URL(url);
  const path = `${target.pathname}${target.search}`;
  return {
    "X-Game-Fields-SDK-Service": createSdkServiceAuthorization({
      method,
      path,
    }, serviceSecret()),
  };
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
