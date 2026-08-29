import {
  createSdkServiceAuthorization,
  verifySdkServiceAuthorization,
  verifySdkServiceOperationAuthorization,
  type SdkServiceOperationGrant,
} from "@game-fields/sdk-service-auth";

export const sdkMigration010OperationAction = "sdk-migration-010";
export const sdkMigration011OperationAction = "sdk-migration-011";

function serviceSecret() {
  const secret = process.env.SDK_ACCOUNT_LINK_SECRET ?? "";
  if (secret.length < 32) throw new Error("SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED");
  return secret;
}

export function requireSdkMigration010OperationRequest(
  request: Request,
  options: { now?: number } = {},
): SdkServiceOperationGrant {
  requireSdkServiceRequest(request, { expectedEnvironment: "production" });
  const url = new URL(request.url);
  const value = request.headers.get("x-game-fields-sdk-operation") ?? "";
  const grant = verifySdkServiceOperationAuthorization(value, {
    method: request.method,
    path: `${url.pathname}${url.search}`,
    environment: "production",
    action: sdkMigration010OperationAction,
    now: options.now,
  }, serviceSecret());
  if (!grant) throw new Error("SDK_OPERATION_GRANT_REQUIRED");
  return grant;
}

export function requireSdkMigration011OperationRequest(
  request: Request,
  options: { now?: number } = {},
): SdkServiceOperationGrant {
  requireSdkServiceRequest(request, { expectedEnvironment: "development" });
  const url = new URL(request.url);
  const value = request.headers.get("x-game-fields-sdk-operation") ?? "";
  const grant = verifySdkServiceOperationAuthorization(value, {
    method: request.method,
    path: `${url.pathname}${url.search}`,
    environment: "development",
    action: sdkMigration011OperationAction,
    now: options.now,
  }, serviceSecret());
  if (!grant) throw new Error("SDK_OPERATION_GRANT_REQUIRED");
  return grant;
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
  options: { environment?: SdkServiceEnvironment; now?: number } = {},
) {
  const target = new URL(url);
  return {
    "X-Game-Fields-SDK-Service": createSdkServiceAuthorization({
      method,
      path: `${target.pathname}${target.search}`,
      environment: options.environment,
      now: options.now,
    }, serviceSecret()),
    ...(options.environment
      ? { "X-Game-Fields-SDK-Environment": options.environment }
      : {}),
  };
}
