import { createHmac } from "node:crypto";
import { operatorOwnerFingerprint } from "../apps/sdk-portal/lib/creator-ownership-diagnostic.ts";

export const productionOwnerRestorationTarget = "moi-lab2" as const;
export const productionOwnerRestorationUsername = "moi" as const;
export const productionOwnerRestorationWorkspaceOperationId =
  "06eb6940-f624-59b0-8d00-47eba9a9cec8" as const;
export const productionOwnerRestorationFixedProductionAccountFingerprint =
  "opf_v1_QTP2zsdJ7Z6c6vgDTPI03XbqOJgsiJfzrGrs2D6L-nM" as const;

export type ProductionOwnerRestorationAccountSource = {
  username: string;
  accountIdentity: string;
  hasRecoveryEmail: boolean;
  grantPresent: boolean;
};

function requireSecret(secret: string) {
  if (secret.length < 32) throw new Error("SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED");
  return secret;
}

export function projectProductionOwnerRestorationAccount(input: {
  accounts: ProductionOwnerRestorationAccountSource[];
  environment: "production" | "development";
  secret: string;
}) {
  const exact = input.accounts.filter(({ username }) => username === productionOwnerRestorationUsername);
  if (exact.length !== 1) throw new Error(exact.length === 0
    ? "OWNER_RESTORATION_ACCOUNT_NOT_FOUND"
    : "OWNER_RESTORATION_ACCOUNT_AMBIGUOUS");
  const account = exact[0]!;
  return {
    schemaVersion: 1,
    environment: input.environment,
    target: productionOwnerRestorationTarget,
    selectionBasis: "OPERATOR_SELECTED_RESTORATION_TARGET",
    username: productionOwnerRestorationUsername,
    accountState: account.hasRecoveryEmail
      ? "ACTIVE_RECOVERY_READY"
      : "ACTIVE_RECOVERY_UNREGISTERED",
    grant: account.grantPresent ? "present" : "absent",
    fingerprint: operatorOwnerFingerprint({
      ownerPlayerId: account.accountIdentity,
      environment: input.environment,
      secret: requireSecret(input.secret),
    }),
  } as const;
}

export function requireProductionOwnerRestorationAccountFingerprint(input: {
  environment: "production" | "development";
  fingerprint: string;
}) {
  if (
    !/^opf_v1_[A-Za-z0-9_-]{43}$/.test(input.fingerprint)
    || (
      input.environment === "production"
      && input.fingerprint !== productionOwnerRestorationFixedProductionAccountFingerprint
    )
  ) throw new Error("OWNER_RESTORATION_ACCOUNT_FINGERPRINT_CHANGED");
  return input.fingerprint;
}

export type ProductionOwnerRestorationWorkspaceSource = {
  workspaceIdentity: string;
  operationId: string;
  bundleSha256: string;
  workspaceManifestSha256: string;
  perGameLedgerSha256: string;
  workspaceRows: number;
  gameRows: number;
  fileRows: number;
  visibility: string;
  ownerBinding: string;
  grants: number;
  releases: number;
  publications: number;
  aliases: number;
  rooms: number;
};

function opaque(prefix: "wpf_v1" | "wst_v1" | "obp_v1", secret: string, environment: string, value: string) {
  return `${prefix}_${createHmac("sha256", requireSecret(secret))
    .update(`${prefix}:${environment}:${value}`)
    .digest("base64url")}`;
}

export function projectProductionOwnerRestorationWorkspace(input: {
  workspace: ProductionOwnerRestorationWorkspaceSource;
  environment: "production" | "development";
  secret: string;
}) {
  const w = input.workspace;
  if (
    w.operationId !== productionOwnerRestorationWorkspaceOperationId
    || !/^[0-9a-f]{64}$/.test(w.bundleSha256)
    || !/^[0-9a-f]{64}$/.test(w.workspaceManifestSha256)
    || !/^[0-9a-f]{64}$/.test(w.perGameLedgerSha256)
    || w.workspaceRows !== 1 || w.gameRows !== 2 || w.fileRows !== 21
    || w.visibility !== "private-quarantined" || w.ownerBinding !== "unbound"
    || w.grants !== 0 || w.releases !== 0 || w.publications !== 0 || w.aliases !== 0 || w.rooms !== 0
  ) throw new Error("OWNER_RESTORATION_WORKSPACE_STATE_INVALID");
  const identityMaterial = [w.workspaceIdentity, w.operationId, w.bundleSha256, w.workspaceManifestSha256, w.perGameLedgerSha256].join("|");
  const stateMaterial = [identityMaterial, w.workspaceRows, w.gameRows, w.fileRows, w.visibility, w.ownerBinding, w.grants, w.releases, w.publications, w.aliases, w.rooms].join("|");
  return {
    target: productionOwnerRestorationTarget,
    operationId: w.operationId,
    bundleSha256: w.bundleSha256,
    workspaceManifestSha256: w.workspaceManifestSha256,
    perGameLedgerSha256: w.perGameLedgerSha256,
    workspaceFingerprint: opaque("wpf_v1", input.secret, input.environment, identityMaterial),
    stateToken: opaque("wst_v1", input.secret, input.environment, stateMaterial),
    counts: { workspaces: 1, games: 2, runtimeFiles: 21 },
    state: { visibility: "private-quarantined", ownerBinding: "unbound" },
    nonEffects: { grants: 0, releases: 0, publications: 0, aliases: 0, rooms: 0 },
  } as const;
}

export function createProductionOwnerBindingWriteFreePlan(input: {
  account: ReturnType<typeof projectProductionOwnerRestorationAccount>;
  workspace: ReturnType<typeof projectProductionOwnerRestorationWorkspace>;
  environment: "production" | "development";
  secret: string;
}) {
  if (
    input.account.environment !== input.environment
    || input.account.target !== productionOwnerRestorationTarget
    || input.account.username !== productionOwnerRestorationUsername
    || input.workspace.target !== productionOwnerRestorationTarget
    || input.workspace.state.ownerBinding !== "unbound"
  ) throw new Error("OWNER_RESTORATION_PLAN_INPUT_INVALID");
  const material = [input.workspace.workspaceFingerprint, input.workspace.stateToken, input.account.fingerprint].join("|");
  return {
    schemaVersion: 1,
    environment: input.environment,
    phase: "write-free-owner-binding-plan",
    target: productionOwnerRestorationTarget,
    selectionBasis: "OPERATOR_SELECTED_RESTORATION_TARGET",
    username: productionOwnerRestorationUsername,
    accountFingerprint: input.account.fingerprint,
    workspaceIdentity: {
      operationId: input.workspace.operationId,
      bundleSha256: input.workspace.bundleSha256,
      workspaceManifestSha256: input.workspace.workspaceManifestSha256,
      perGameLedgerSha256: input.workspace.perGameLedgerSha256,
      fingerprint: input.workspace.workspaceFingerprint,
    },
    counts: input.workspace.counts,
    currentWorkspaceStateToken: input.workspace.stateToken,
    plannedEffect: {
      ownerBindings: 1,
      ownerUsername: productionOwnerRestorationUsername,
      visibilityAfter: "private-quarantined",
      quarantinedAfter: true,
      publicAfter: false,
    },
    nonEffects: { grants: 0, releases: 0, publications: 0, aliases: 0, rooms: 0 },
    planReceipt: opaque("obp_v1", input.secret, input.environment, material),
  } as const;
}
