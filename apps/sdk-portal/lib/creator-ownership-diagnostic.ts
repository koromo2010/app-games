import { createHmac } from "node:crypto";

export type CreatorOwnershipDiagnosticCounts = {
  games: number;
  drafts: number;
  prototypeRevisions: number;
  packageRevisions: number;
  currentReleases: number;
  activeGrants: number;
  revokedGrants: number;
};

export type CreatorOwnershipLifecycle =
  | "active"
  | "deleted"
  | "missing";

export type PrincipalValidity = "active" | "missing" | "unknown";

export function operatorOwnerFingerprint(input: {
  ownerPlayerId: string;
  environment: "production" | "development";
  secret: string;
}) {
  if (input.secret.length < 32) {
    throw new Error("OWNER_DIAGNOSTIC_SECRET_NOT_CONFIGURED");
  }
  return `opf_v1_${createHmac("sha256", input.secret)
    .update(`creator-owner:${input.environment}:${input.ownerPlayerId}`)
    .digest("base64url")}`;
}

export function createCreatorOwnershipDiagnostic(input: {
  slug: string;
  lifecycle: CreatorOwnershipLifecycle;
  ownerPlayerId: string | null;
  principalValidity: PrincipalValidity;
  counts: CreatorOwnershipDiagnosticCounts;
  environment: "production" | "development";
  secret: string;
}) {
  const ownerState = input.ownerPlayerId === null
    ? "null"
    : input.ownerPlayerId === ""
      ? "empty"
      : "bound";
  const ownerFingerprint = ownerState === "bound"
    ? operatorOwnerFingerprint({
        ownerPlayerId: input.ownerPlayerId!,
        environment: input.environment,
        secret: input.secret,
      })
    : null;
  const grantConsistency = ownerState !== "bound"
    ? "NOT_APPLICABLE"
    : input.principalValidity === "missing" && input.counts.activeGrants > 0
      ? "MISMATCH"
      : input.principalValidity === "unknown"
        ? "UNKNOWN"
        : "MATCH";
  return {
    schemaVersion: 1,
    environment: input.environment,
    creator: {
      slug: input.slug,
      lifecycle: input.lifecycle,
    },
    owner: {
      state: ownerState,
      fingerprint: ownerFingerprint,
      principalValidity: ownerState === "bound"
        ? input.principalValidity
        : "NOT_APPLICABLE",
    },
    assets: {
      games: input.counts.games,
      drafts: input.counts.drafts,
      prototypeRevisions: input.counts.prototypeRevisions,
      packageRevisions: input.counts.packageRevisions,
      currentReleases: input.counts.currentReleases,
    },
    grants: {
      active: input.counts.activeGrants,
      revoked: input.counts.revokedGrants,
      consistency: grantConsistency,
    },
  } as const;
}
