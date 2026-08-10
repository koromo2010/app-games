import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import platformRelease from "../../../config/platform-release.json" with { type: "json" };
import { sdkCanonicalMcpUrl } from "@game-fields/sdk-release-profiles";
import { sdkPortalReleaseProfile } from "./sdk-release-profile.ts";

const BINDING_VERSION = 1;
const BINDING_LIFETIME_MS = 24 * 60 * 60 * 1000;

type BindingAuth = {
  playerId: string;
  clientId: string;
};

type BindingPayload = {
  version: typeof BINDING_VERSION;
  subject: string;
  oauthClientId: string;
  clientName: "ChatGPT Work" | "Claude Code";
  targetEnvironment: "production" | "development";
  canonicalMcpUrl: string;
  platformVersion: string;
  sdkPackageVersion: string;
  sdkContractVersion: number;
  onboardingProfileId: string;
  issuedAt: number;
  expiresAt: number;
};

function bindingSecret() {
  const secret = process.env.SDK_ACCOUNT_LINK_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error("SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED");
  }
  return secret;
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signature(encodedPayload: string) {
  return createHmac("sha256", bindingSecret())
    .update(`game-fields-authoring-binding:v${BINDING_VERSION}:`)
    .update(encodedPayload)
    .digest("base64url");
}

function same(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function subject(playerId: string) {
  return createHash("sha256").update(playerId).digest("base64url");
}

function currentIdentity(origin?: string) {
  const profile = sdkPortalReleaseProfile(origin);
  return {
    targetEnvironment: profile.environment,
    canonicalMcpUrl: sdkCanonicalMcpUrl(profile),
    platformVersion: platformRelease.platformVersion,
    sdkPackageVersion: platformRelease.sdkPackageVersion,
    sdkContractVersion: platformRelease.sdkContractVersion,
    onboardingProfileId: profile.onboardingProfileId,
  } as const;
}

export function createAuthoringEnvironmentBinding(input: {
  auth: BindingAuth;
  clientName: "ChatGPT Work" | "Claude Code";
  origin?: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const payload: BindingPayload = {
    version: BINDING_VERSION,
    subject: subject(input.auth.playerId),
    oauthClientId: input.auth.clientId,
    clientName: input.clientName,
    ...currentIdentity(input.origin),
    issuedAt: now,
    expiresAt: now + BINDING_LIFETIME_MS,
  };
  const encodedPayload = encode(payload);
  return {
    environmentBinding: `${encodedPayload}.${signature(encodedPayload)}`,
    identity: currentIdentity(input.origin),
    clientName: input.clientName,
    expiresAt: payload.expiresAt,
  };
}

export function verifyAuthoringEnvironmentBinding(input: {
  environmentBinding: unknown;
  auth: BindingAuth;
  origin?: string;
  now?: number;
}) {
  if (typeof input.environmentBinding !== "string") {
    throw new Error("SDK_HANDSHAKE_REQUIRED");
  }
  const [encodedPayload, receivedSignature, extra] = input.environmentBinding.split(".");
  if (!encodedPayload || !receivedSignature || extra || !same(signature(encodedPayload), receivedSignature)) {
    throw new Error("AUTHORING_ENVIRONMENT_BINDING_MISMATCH");
  }
  let payload: BindingPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as BindingPayload;
  } catch {
    throw new Error("AUTHORING_ENVIRONMENT_BINDING_MISMATCH");
  }
  const expected = currentIdentity(input.origin);
  const now = input.now ?? Date.now();
  if (
    payload.version !== BINDING_VERSION
    || payload.subject !== subject(input.auth.playerId)
    || payload.oauthClientId !== input.auth.clientId
    || (payload.clientName !== "ChatGPT Work" && payload.clientName !== "Claude Code")
    || payload.targetEnvironment !== expected.targetEnvironment
    || payload.canonicalMcpUrl !== expected.canonicalMcpUrl
    || payload.platformVersion !== expected.platformVersion
    || payload.sdkPackageVersion !== expected.sdkPackageVersion
    || payload.sdkContractVersion !== expected.sdkContractVersion
    || payload.onboardingProfileId !== expected.onboardingProfileId
    || !Number.isSafeInteger(payload.issuedAt)
    || !Number.isSafeInteger(payload.expiresAt)
    || payload.issuedAt > now + 60_000
    || payload.expiresAt <= now
  ) {
    throw new Error("AUTHORING_ENVIRONMENT_BINDING_MISMATCH");
  }
  return { payload, identity: expected };
}
