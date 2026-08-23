import { operatorOwnerFingerprint } from "./creator-ownership-diagnostic.ts";
import { deletionWindowConsistency, type ForensicArtifactSummary } from "./creator-deletion-forensics.ts";

export type ExactTargetLifecycle = "missing" | "active" | "deleted" | "ambiguous";
export type ExactTargetObservation = "OBSERVED" | "UNKNOWN";

export const exactTargetSafeProjectionHeaders = [
  "creator-slug",
  "slug",
  "target",
  "target-slug",
  "x-creator-slug",
  "x-creator-target",
  "x-target-slug",
] as const;

export function acceptsExactTargetSafeProjectionRequest(request: Request, expectedPath: string) {
  const url = new URL(request.url);
  const contentLength = request.headers.get("content-length");
  return request.method === "GET"
    && url.pathname === expectedPath
    && url.search === ""
    && request.body === null
    && (contentLength === null || contentLength === "0")
    && exactTargetSafeProjectionHeaders.every((name) => !request.headers.has(name));
}

function count(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function owner(input: {
  ownerPlayerId: string | null;
  environment: "production" | "development";
  secret: string;
  observation: ExactTargetObservation;
}) {
  if (input.observation === "UNKNOWN") {
    return { state: "UNKNOWN", fingerprint: null } as const;
  }
  if (input.ownerPlayerId === null) return { state: "NULL", fingerprint: null } as const;
  if (input.ownerPlayerId === "") return { state: "EMPTY", fingerprint: null } as const;
  try {
    return {
      state: "BOUND",
      fingerprint: operatorOwnerFingerprint({
        ownerPlayerId: input.ownerPlayerId,
        environment: input.environment,
        secret: input.secret,
      }),
    } as const;
  } catch {
    return { state: "BOUND", fingerprint: null } as const;
  }
}

export function createYabobojpnLabSafeProjection(input: {
  environment: "production" | "development";
  observation: ExactTargetObservation;
  lifecycle: ExactTargetLifecycle;
  deletedAt: unknown;
  ownerPlayerId: string | null;
  secret: string;
  counts: {
    games: unknown;
    packageRevisions: unknown;
    releases: unknown;
    currentReleases: unknown;
    activeGrants: unknown;
    revokedGrants: unknown;
  };
  artifactSummary?: ForensicArtifactSummary;
}) {
  const values = {
    games: count(input.counts.games),
    packageRevisions: count(input.counts.packageRevisions),
    releases: count(input.counts.releases),
    currentReleases: count(input.counts.currentReleases),
    activeGrants: count(input.counts.activeGrants),
    revokedGrants: count(input.counts.revokedGrants),
  };
  const ownerProjection = owner(input);
  const artifactObservation = input.artifactSummary && input.artifactSummary.unavailable === 0
    ? "OBSERVED" as const
    : "UNKNOWN" as const;
  const artifactAvailable = input.artifactSummary
    ? count(input.artifactSummary.present)
    : 0;
  const grantsConsistency = ownerProjection.state === "BOUND"
    ? "OWNER_BOUND_GRANT_COUNTS_OBSERVED"
    : ownerProjection.state === "UNKNOWN"
      ? "UNKNOWN"
      : "NOT_APPLICABLE";
  const publicationConsistency = input.observation === "UNKNOWN"
    ? "UNKNOWN"
    : values.releases === 0
      ? "NO_RELEASES"
      : values.games === 0
        ? "RELEASES_WITHOUT_SOURCE_GAMES"
        : values.currentReleases > values.releases
          ? "INCONSISTENT_CURRENT_RELEASE_COUNT"
          : "RELEASES_WITH_SOURCE_GAMES";
  const quarantineFirstRecoveryFeasibility = input.observation === "UNKNOWN"
    ? "UNKNOWN"
    : input.lifecycle === "missing"
      ? "NOT_APPLICABLE_TARGET_MISSING"
      : input.lifecycle === "active"
        ? "NOT_APPLICABLE_CREATOR_ACTIVE"
        : values.games === 0
          ? "NO_QUARANTINE_CANDIDATES"
          : "REQUIRES_SEPARATE_AUTHORIZATION";
  return {
    schemaVersion: 1,
    environment: input.environment,
    scope: "exact-target-safe-projection",
    creator: {
      lifecycle: input.lifecycle,
    },
    deletionWindow: {
      consistency: input.observation === "UNKNOWN"
        ? "UNKNOWN"
        : deletionWindowConsistency(input.deletedAt),
    },
    owner: ownerProjection,
    aggregates: {
      games: values.games,
      packageRevisions: values.packageRevisions,
      releases: values.releases,
      gitArtifactsAvailable: artifactAvailable,
    },
    grants: {
      active: values.activeGrants,
      revoked: values.revokedGrants,
      consistency: grantsConsistency,
    },
    publication: {
      consistency: publicationConsistency,
    },
    recovery: {
      quarantineFirstFeasibility: quarantineFirstRecoveryFeasibility,
    },
    observations: {
      store: input.observation,
      gitArtifacts: artifactObservation,
    },
  } as const;
}
