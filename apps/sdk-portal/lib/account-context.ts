import { createHmac } from "node:crypto";
import { sdkPortalReleaseProfile } from "./sdk-release-profile.ts";

export const ACCOUNT_CONTEXT_VERSION = 1 as const;
const ACCOUNT_REF_DOMAIN = "game-fields-account-ref:v1:";

export type PublicAccountContext = {
  version: typeof ACCOUNT_CONTEXT_VERSION;
  accountRef: string;
  displayName: string | null;
  environment: "development" | "production";
  contextVersion: typeof ACCOUNT_CONTEXT_VERSION;
};

function accountContextSecret() {
  const value = process.env.SDK_ACCOUNT_LINK_SECRET?.trim() ?? "";
  if (value.length < 32) throw new Error("SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED");
  return value;
}

export function createAccountRef(playerId: string, environment: PublicAccountContext["environment"]) {
  return `acr_v${ACCOUNT_CONTEXT_VERSION}_${createHmac("sha256", accountContextSecret())
    .update(ACCOUNT_REF_DOMAIN)
    .update(environment)
    .update(":")
    .update(playerId)
    .digest("base64url")}`;
}

export function createAccountContext(input: {
  playerId: string;
  displayName?: string | null;
  origin?: string;
}): PublicAccountContext {
  const environment = sdkPortalReleaseProfile(input.origin).environment;
  return {
    version: ACCOUNT_CONTEXT_VERSION,
    accountRef: createAccountRef(input.playerId, environment),
    displayName: input.displayName?.trim() || null,
    environment,
    contextVersion: ACCOUNT_CONTEXT_VERSION,
  };
}

export function assertExpectedAccountContext(input: {
  expectedAccountRef: unknown;
  expectedContextVersion?: unknown;
  playerId: string;
  origin?: string;
}) {
  if (typeof input.expectedAccountRef !== "string" || !input.expectedAccountRef.trim()) {
    throw new Error("SDK_ACCOUNT_CONTEXT_REQUIRED");
  }
  const actual = createAccountContext({ playerId: input.playerId, origin: input.origin });
  if (
    input.expectedAccountRef !== actual.accountRef
    || (
      input.expectedContextVersion !== undefined
      && input.expectedContextVersion !== ACCOUNT_CONTEXT_VERSION
    )
  ) {
    throw new Error("SDK_ACCOUNT_CONTEXT_MISMATCH");
  }
  return actual;
}

export function shortenAccountRef(accountRef: string) {
  return accountRef.length > 18
    ? `${accountRef.slice(0, 10)}…${accountRef.slice(-6)}`
    : accountRef;
}
