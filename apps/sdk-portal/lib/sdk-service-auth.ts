import {
  createSdkServiceAuthorization,
  verifySdkServiceAuthorization,
} from "@game-fields/sdk-service-auth";

function serviceSecret() {
  const secret = process.env.SDK_ACCOUNT_LINK_SECRET ?? "";
  if (secret.length < 32) throw new Error("SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED");
  return secret;
}

type SdkServiceEnvironment = "production" | "development";

export function requireSdkServiceRequest(
  request: Request,
  options: { expectedEnvironment?: SdkServiceEnvironment } = {},
) {
  const value = request.headers.get("x-game-fields-sdk-service") ?? "";
  const environment = request.headers.get("x-game-fields-sdk-environment")
    ?? undefined;
  const url = new URL(request.url);
  if (
    options.expectedEnvironment
    && environment !== options.expectedEnvironment
  ) {
    throw new Error("SDK_SERVICE_ENVIRONMENT_MISMATCH");
  }
  if (!verifySdkServiceAuthorization(value, {
    method: request.method,
    path: `${url.pathname}${url.search}`,
    environment: options.expectedEnvironment,
  }, serviceSecret())) {
    throw new Error("SDK_SERVICE_AUTH_REQUIRED");
  }
}

export function sdkServiceHeaders(
  method: string,
  url: string,
  options: { environment?: SdkServiceEnvironment } = {},
) {
  const target = new URL(url);
  return {
    "X-Game-Fields-SDK-Service": createSdkServiceAuthorization({
      method,
      path: `${target.pathname}${target.search}`,
      environment: options.environment,
    }, serviceSecret()),
    ...(options.environment
      ? { "X-Game-Fields-SDK-Environment": options.environment }
      : {}),
  };
}
