import type { RuntimeArtifactReader } from "@game-fields/sdk-runtime-artifact";

export const creatorDeletionForensicsTarget = "moi-lab2";
export const yabobojpnLabSafeProjectionTarget = "yabobojpn-lab";

export type ForensicArtifactTarget = {
  kind: "mock" | "package";
  gameId: string;
  revision: string;
};

export type ForensicArtifactSummary = {
  status: "NO_LOCATORS" | "COMPLETE" | "PARTIAL" | "BOUNDED_OUT";
  locators: number;
  checked: number;
  present: number;
  missing: number;
  unavailable: number;
};

const maximumArtifactChecks = 50;

async function inspectExactCreatorArtifacts(
  targets: readonly ForensicArtifactTarget[],
  reader: Pick<RuntimeArtifactReader, "readCommit" | "readTree">,
  creatorSlug: string,
): Promise<ForensicArtifactSummary> {
  const unique = [...new Map(targets.map((target) => [
    `${target.kind}:${target.gameId}:${target.revision}`,
    target,
  ])).values()];
  if (unique.length === 0) {
    return { status: "NO_LOCATORS", locators: 0, checked: 0, present: 0, missing: 0, unavailable: 0 };
  }
  const bounded = unique.slice(0, maximumArtifactChecks);
  let present = 0;
  let missing = 0;
  let unavailable = 0;
  const trees = new Map<string, Awaited<ReturnType<RuntimeArtifactReader["readTree"]>>>();
  for (const target of bounded) {
    try {
      const commit = await reader.readCommit(target.revision);
      if (!commit) {
        missing += 1;
        continue;
      }
      let tree = trees.get(commit.treeSha);
      if (tree === undefined) {
        tree = await reader.readTree(commit.treeSha);
        trees.set(commit.treeSha, tree);
      }
      if (!tree) {
        unavailable += 1;
        continue;
      }
      const prefix = target.kind === "mock"
        ? `previews/${creatorSlug}/${target.gameId}/mock/`
        : `packages/${creatorSlug}/${target.gameId}/bundle/`;
      if (tree.some((entry) => entry.type === "blob" && entry.path.startsWith(prefix))) {
        present += 1;
      } else {
        missing += 1;
      }
    } catch {
      unavailable += 1;
    }
  }
  const status = unique.length > maximumArtifactChecks
    ? "BOUNDED_OUT"
    : missing === 0 && unavailable === 0
      ? "COMPLETE"
      : "PARTIAL";
  return {
    status,
    locators: unique.length,
    checked: bounded.length,
    present,
    missing,
    unavailable,
  };
}

export async function inspectCreatorArtifacts(
  targets: readonly ForensicArtifactTarget[],
  reader: Pick<RuntimeArtifactReader, "readCommit" | "readTree">,
): Promise<ForensicArtifactSummary> {
  return inspectExactCreatorArtifacts(targets, reader, creatorDeletionForensicsTarget);
}

export async function inspectYabobojpnLabArtifacts(
  targets: readonly ForensicArtifactTarget[],
  reader: Pick<RuntimeArtifactReader, "readCommit" | "readTree">,
): Promise<ForensicArtifactSummary> {
  return inspectExactCreatorArtifacts(targets, reader, yabobojpnLabSafeProjectionTarget);
}

function timestamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function deletionWindowConsistency(deletedAt: unknown) {
  const normalized = timestamp(deletedAt);
  if (!normalized) return "NOT_ESTABLISHED" as const;
  const date = new Date(normalized);
  return date.getUTCHours() === 0 && date.getUTCMinutes() === 43
    ? "CONSISTENT_WITH_LEGACY_0043_UTC_RETENTION_TRIGGER" as const
    : "OUTSIDE_LEGACY_0043_UTC_TRIGGER_MINUTE" as const;
}

export function createCreatorDeletionTargetProjection(input: {
  environment: "production" | "development";
  creator: {
    lifecycle: "deleted" | "active" | "missing";
    ownerIsNull: boolean;
    createdAt: unknown;
    updatedAt: unknown;
    deletedAt: unknown;
  };
  assets: Record<string, number>;
  artifactSummary: ForensicArtifactSummary;
}) {
  const deletedAt = timestamp(input.creator.deletedAt);
  return {
    schemaVersion: 1,
    environment: input.environment,
    scope: "exact-target",
    creator: {
      slug: creatorDeletionForensicsTarget,
      lifecycle: input.creator.lifecycle,
      ownerState: input.creator.ownerIsNull ? "null" : "bound",
      createdAt: timestamp(input.creator.createdAt),
      updatedAt: timestamp(input.creator.updatedAt),
      deletedAt,
    },
    causality: {
      leadingHypothesis: "LEGACY_ONE_MONTH_RETENTION_TRIGGER",
      triggerWindowConsistency: deletionWindowConsistency(deletedAt),
      directHistoricalOperationLedger: "ABSENT_BEFORE_T123",
      conclusion: "CONSISTENT_NOT_PROVEN",
    },
    assets: input.assets,
    preDeleteState: {
      exactGameStatus: "UNRECOVERABLE_FROM_LIVE_ROW_AFTER_DELETE_STATUS_OVERWRITE",
      immutableRevisionLocators: input.artifactSummary.locators,
    },
    stores: {
      sdkPostgres: "PHYSICAL_ROWS_COUNTED_IN_ASSETS",
      gitArtifacts: input.artifactSummary,
      platformPostgres: "NOT_CORRELATABLE_AFTER_OWNER_CLEAR_AND_ACCOUNT_DELETE",
      redis: "NON_AUTHORITATIVE_AND_NOT_CORRELATABLE",
      oauth: "REVOKED_BY_SOURCE_BUT_NOT_CORRELATABLE_AFTER_OWNER_CLEAR",
      blob: "NOT_REFERENCED_BY_SDK_ACCOUNT_DELETION_PATH",
    },
  } as const;
}

export function createCreatorDeletionAggregateProjection(input: {
  environment: "production" | "development";
  counts: Record<string, number>;
  earliestDeletedAt: unknown;
  latestDeletedAt: unknown;
}) {
  return {
    schemaVersion: 1,
    environment: input.environment,
    scope: "aggregate-no-slugs",
    blastRadius: {
      ...input.counts,
      earliestDeletedAt: timestamp(input.earliestDeletedAt),
      latestDeletedAt: timestamp(input.latestDeletedAt),
    },
  } as const;
}
