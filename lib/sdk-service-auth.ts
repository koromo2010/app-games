import {
  createSdkServiceAuthorization,
} from "@game-fields/sdk-preview-auth";

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
