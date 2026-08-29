import {
  createSdkServiceAuthorization,
  createSdkServiceOperationAuthorization,
  verifySdkServiceAuthorization,
} from "@game-fields/sdk-service-auth";

export const sdkMigration010OperationAction = "sdk-migration-010";
export const sdkMigration011OperationAction = "sdk-migration-011";

function serviceSecret() {
  const secret = process.env.SDK_ACCOUNT_LINK_SECRET ?? "";
  if (secret.length < 32) throw new Error("SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED");
  return secret;
}

type SdkServiceEnvironment = "production" | "development";

export function sdkServiceHeaders(
  method: string,
  url: string,
  options: { environment?: SdkServiceEnvironment; now?: number } = {},
) {
  const target = new URL(url);
  const path = `${target.pathname}${target.search}`;
  return {
    "X-Game-Fields-SDK-Service": createSdkServiceAuthorization({
      method,
      path,
      environment: options.environment,
      now: options.now,
    }, serviceSecret()),
    ...(options.environment
      ? { "X-Game-Fields-SDK-Environment": options.environment }
      : {}),
  };
}

export function sdkMigration010OperationHeaders(
  url: string,
  input: { operationId: string; nonce: string; now?: number },
) {
  const target = new URL(url);
  const path = `${target.pathname}${target.search}`;
  const now = input.now ?? Date.now();
  return {
    ...sdkServiceHeaders("POST", url, {
      environment: "production",
      now,
    }),
    "X-Game-Fields-SDK-Operation": createSdkServiceOperationAuthorization({
      method: "POST",
      path,
      environment: "production",
      action: sdkMigration010OperationAction,
      operationId: input.operationId,
      nonce: input.nonce,
      now,
    }, serviceSecret()),
  };
}

export function sdkMigration011OperationHeaders(
  url: string,
  input: { operationId: string; nonce: string; now?: number },
) {
  const target = new URL(url);
  const path = `${target.pathname}${target.search}`;
  const now = input.now ?? Date.now();
  return {
    ...sdkServiceHeaders("POST", url, {
      environment: "development",
      now,
    }),
    "X-Game-Fields-SDK-Operation": createSdkServiceOperationAuthorization({
      method: "POST",
      path,
      environment: "development",
      action: sdkMigration011OperationAction,
      operationId: input.operationId,
      nonce: input.nonce,
      now,
    }, serviceSecret()),
  };
}

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
