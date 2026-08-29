import { createHash } from "node:crypto";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import { auditGamePackageAssets } from "../../../packages/sdk-package-assets/src/index.ts";
import {
  assertGameManifest,
  type GameSdkManifest,
} from "../../../packages/game-sdk/src/index.ts";
import { validateGameSdkMockQuality } from "../../../packages/game-sdk/src/mock-quality.ts";
import { GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION } from "../../../packages/game-sdk/src/portable-server.ts";
import {
  runGameSdkPortableCommandBatch,
  runGameSdkPortableServer,
} from "../../sdk-preview/lib/server-runner.ts";
import type { OriginalDataPreservationArtifactManifest } from "./original-data-preservation.ts";
import { createStoredZip, type StoredZipEntry } from "./stored-zip.ts";
import {
  convertT131A4LegacyMockManifest,
  normalizeT131A4LegacyMock,
  t131A4AuthoringMockAdapterVersion,
  type T131A4ManifestConversion,
} from "./creator-authoring-state-legacy-mock-adapter.ts";
import {
  canonicalT131A4Json,
  classifyT131A4Locator,
  classifyT131A4NormalizedMock,
  materializeT131A4TargetArtifactSet,
  t131A4A3SourceProof,
  t131A4A0SourceMainCommit,
  t131A4ConverterVersion,
  t131A4JsonDocument,
  t131A4LocalParent,
  t131A4PhaseId,
  t131A4Targets,
  verifyT131A4FixedArchive,
  type T131A4ArtifactLocator,
  type T131A4CurrentFormatFile,
  type T131A4PackageRebuilder,
  type T131A4Target,
} from "./creator-artifact-reconstruction.ts";
import {
  rebuildT131A4DefinitionBackedQuarto,
  t131A4DefinitionRebuilderVersion,
  type T131A4DefinitionBackedRebuild,
  type T131A4DefinitionSmokeStep,
} from "./creator-authoring-state-definition-rebuild.ts";

type JsonRow = Record<string, unknown>;
const gameIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export type T131A4AuthoringHead = {
  kind: "mock" | "package";
  revision: string;
  selectionEvidence:
    | "sdk_games.mock_revision"
    | "sdk_games.package_revision"
    | "independent_cross_evidence";
};

export type T131A4ReleaseReference = {
  id: string | null;
  lineageId: string | null;
  publicGameId: string | null;
  revision: string | null;
  packageRootSha256: string | null;
  serverBundleSha256: string | null;
  appSetSourceSha256: string | null;
  sourceEnvironment: string | null;
  releaseKind: string | null;
  restoredFrom: string | null;
  isCurrent: boolean | null;
  sourceRevision: string | null;
};

export type T131A4GameInventory = {
  target: T131A4Target;
  gameRowId: string;
  gameId: string;
  title: string;
  description: string;
  manifest: unknown;
  legacyManifest: unknown;
  manifestConversion: T131A4ManifestConversion | null;
  modulePolicy: unknown;
  sdkPackageVersion: string | null;
  sdkContractVersion: number | null;
  status: string | null;
  publicGameId: string | null;
  deletedAt: string | null;
  authoringPointers: {
    mockRevision: string | null;
    mockApprovedRevision: string | null;
    packageRevision: string | null;
    developmentRevision: string | null;
    stableRevision: string | null;
  };
  head: T131A4AuthoringHead | null;
  headLocator: T131A4ArtifactLocator | null;
  headResolutionEvidence: {
    method: "EXPLICIT_DB_POINTER" | "INDEPENDENT_CROSS_EVIDENCE" | "UNRESOLVED";
    selectedRevision: string | null;
    candidates: Array<{
      kind: "mock" | "package";
      revision: string;
      treeSha: string;
      fileSetSha256: string;
      references: readonly string[];
      packageRevisionRowMatches: number;
      manifestMatches: boolean;
      contentHashMatches: boolean;
    }>;
    missingEvidence: string[];
  };
  packageRevisionEvidence: JsonRow | null;
  ownerReference: string | null;
  releaseReferences: T131A4ReleaseReference[];
  channelProvenance: {
    packageRootSha256: string | null;
    packageBundleSha256: string | null;
    packageAppSetSha256: string | null;
    developmentRootSha256: string | null;
    developmentBundleSha256: string | null;
    developmentAppSetSha256: string | null;
    stableRootSha256: string | null;
    stableBundleSha256: string | null;
    stableAppSetSha256: string | null;
  };
  authoringMetadata: {
    mockApprovedAt: string | null;
    moduleProfileRevision: string | null;
    moduleContractDigest: string | null;
    moduleProfileConfirmedAt: string | null;
    prototypeModuleProfileRevision: string | null;
    prototypeModuleContractDigest: string | null;
    prototypeSdkPackageVersion: string | null;
    prototypeSourceSha256: string | null;
  };
  blockerCodes: string[];
  deferred: {
    artifactLocatorCount: number;
    packageRevisionCount: number;
    releaseCount: number;
  };
};

export type T131A4TargetWorkspaceInventory = {
  target: T131A4Target;
  creatorRowId: string;
  creatorDisplayName: string;
  ownerReference: string | null;
  games: T131A4GameInventory[];
  artifactLocatorCount: number;
  packageRevisionCount: number;
  releaseCount: number;
};

export type T131A4GameSmokeResult = {
  manifestValidation: "PASS" | "FAIL";
  clientBoot: "PASS" | "FAIL" | "NOT_REQUIRED";
  serverInitialization: "PASS" | "FAIL" | "NOT_REQUIRED";
  basicInteraction: "PASS" | "FAIL";
  statePresentationReconciliation: "PASS" | "FAIL" | "NOT_REQUIRED";
  requiredAssets: "PASS" | "FAIL";
  networkDependency: "NONE";
  blockerCodes: string[];
};

export type T131A4PerGameLedger = {
  target: T131A4Target;
  gameRowId: string;
  gameId: string;
  authoringHead: T131A4AuthoringHead | null;
  reconstruction: "READY" | "BLOCKED";
  reconstructionMode: "ARTIFACT_HEAD" | "DEFINITION_BACKED_SEMANTIC_REBUILD" | null;
  compatibilityClass: string | null;
  converterVersion: typeof t131A4ConverterVersion | null;
  authoringAdapterVersion: typeof t131A4AuthoringMockAdapterVersion | null;
  authoringAdapterEvidenceSha256: string | null;
  definitionRebuilderVersion: typeof t131A4DefinitionRebuilderVersion | null;
  definitionEvidenceSha256: string | null;
  manifestConversionSha256: string | null;
  canonicalInputSha256: string | null;
  originalRevision: string | null;
  currentOutputSha256: string | null;
  packageRootSha256: string | null;
  serverBundleSha256: string | null;
  appSetSourceSha256: string | null;
  smoke: T131A4GameSmokeResult | null;
  headResolutionEvidence: T131A4GameInventory["headResolutionEvidence"];
  blockerCodes: string[];
  deferred: T131A4GameInventory["deferred"];
};

export type T131A4WorkspaceBundle = {
  target: T131A4Target;
  archive: Buffer;
  archiveSha256: string;
  gameLedger: T131A4PerGameLedger[];
  readyGameCount: number;
  blockedGameCount: number;
};

export type T131A4AuthoringStateResult = {
  workspaces: [T131A4WorkspaceBundle, T131A4WorkspaceBundle];
  aggregateLedger: {
    schemaVersion: 1;
    phaseId: typeof t131A4PhaseId;
    localParent: typeof t131A4LocalParent;
    a0SourceMainCommit: typeof t131A4A0SourceMainCommit;
    targetCount: 2;
    gameCount: number;
    readyGameCount: number;
    blockedGameCount: number;
    targets: Array<{
      target: T131A4Target;
      gameCount: number;
      readyGameCount: number;
      blockedGameCount: number;
      workspaceBundleSha256: string;
    }>;
    state:
      | "LOCAL_TWO_CLIENT_AUTHORING_STATE_RECONSTRUCTION_READY"
      | "AUTHORING_STATE_RECONSTRUCTION_INCOMPLETE";
    runtimeSmoke:
      | "ALL_SEVEN_GAMES_RUNTIME_SMOKE_PASS"
      | "PER_GAME_RUNTIME_SMOKE_INCOMPLETE";
    externalWrites: 0;
  };
  aggregateLedgerBytes: Buffer;
  stagedRecoveryPlan: string;
};

export type T131A4RuntimeSmoke = (input: {
  game: T131A4GameInventory;
  files: readonly T131A4CurrentFormatFile[];
  runtimeKind?: "mock" | "package";
  definitionSmokeSequence?: readonly T131A4DefinitionSmokeStep[];
}) => Promise<T131A4GameSmokeResult>;

export class T131A4AuthoringStateError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "T131A4AuthoringStateError";
  }
}

function fail(code: string): never {
  throw new T131A4AuthoringStateError(code);
}

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function integerOrNull(value: unknown) {
  return Number.isSafeInteger(value) ? Number(value) : null;
}

function booleanOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function safeReleaseReference(row: JsonRow): T131A4ReleaseReference {
  return {
    id: stringOrNull(row.id),
    lineageId: stringOrNull(row.lineage_id),
    publicGameId: stringOrNull(row.public_game_id),
    revision: stringOrNull(row.revision),
    packageRootSha256: stringOrNull(row.package_root_sha256),
    serverBundleSha256: stringOrNull(row.server_bundle_sha256),
    appSetSourceSha256: stringOrNull(row.app_set_source_sha256),
    sourceEnvironment: stringOrNull(row.source_environment),
    releaseKind: stringOrNull(row.release_kind),
    restoredFrom: stringOrNull(row.restored_from),
    isCurrent: booleanOrNull(row.is_current),
    sourceRevision: stringOrNull(row.source_revision),
  };
}

function parseRows(entries: ReadonlyMap<string, Buffer>, target: T131A4Target, table: string) {
  const raw = entries.get(`db/${target}/${table}.json`);
  if (!raw) fail("A4_WORKSPACE_DB_SNAPSHOT_MISSING");
  try {
    const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) as unknown;
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      fail("A4_WORKSPACE_DB_SNAPSHOT_INVALID");
    }
    return rows as JsonRow[];
  } catch (error) {
    if (error instanceof T131A4AuthoringStateError) throw error;
    fail("A4_WORKSPACE_DB_SNAPSHOT_INVALID");
  }
}

function exactHeadLocator(
  locators: readonly T131A4ArtifactLocator[],
  gameId: string,
  head: T131A4AuthoringHead,
) {
  const matches = locators.filter((locator) => (
    locator.gameId === gameId
    && locator.kind === head.kind
    && locator.originalRevision === head.revision
  ));
  return matches.length === 1 ? matches[0]! : null;
}

function packageRow(
  rows: readonly JsonRow[],
  gameRowId: string,
  revision: string,
) {
  const matches = rows.filter((row) => (
    row.game_id === gameRowId && row.revision === revision
  ));
  return matches.length === 1 ? matches[0]! : null;
}

function locatorFileSetSha256(locator: T131A4ArtifactLocator) {
  return sha256(canonicalT131A4Json(locator.files.map((file) => ({
    path: file.path,
    bytes: file.bytes,
    sha256: file.contentSha256,
  }))));
}

function packageLocatorEvidence(
  locator: T131A4ArtifactLocator,
  packageRows: readonly JsonRow[],
  gameRowId: string,
  gameManifest: unknown,
) {
  const rows = packageRows.filter((row) => row.game_id === gameRowId && row.revision === locator.originalRevision);
  const row = rows.length === 1 ? rows[0]! : null;
  const byPath = new Map(locator.files.map((file) => [file.path, file]));
  const manifestMatches = Boolean(row)
    && canonicalT131A4Json(row!.manifest) === canonicalT131A4Json(gameManifest);
  const contentHashMatches = Boolean(row)
    && row!.server_bundle_sha256 === byPath.get("server.bundle.js")?.contentSha256
    && row!.app_set_source_sha256 === byPath.get("source/app-set.ts")?.contentSha256;
  return { rows, manifestMatches, contentHashMatches };
}

function resolveIndependentAuthoringHead(input: {
  gameId: string;
  gameRowId: string;
  gameManifest: unknown;
  locators: readonly T131A4ArtifactLocator[];
  packageRows: readonly JsonRow[];
}) {
  const related = input.locators.filter((locator) => locator.gameId === input.gameId);
  const candidates = related.map((locator) => {
    const packageEvidence = locator.kind === "package"
      ? packageLocatorEvidence(locator, input.packageRows, input.gameRowId, input.gameManifest)
      : { rows: [], manifestMatches: false, contentHashMatches: false };
    return {
      kind: locator.kind,
      revision: locator.originalRevision,
      treeSha: locator.originalTreeSha,
      fileSetSha256: locatorFileSetSha256(locator),
      references: locator.references,
      packageRevisionRowMatches: packageEvidence.rows.length,
      manifestMatches: packageEvidence.manifestMatches,
      contentHashMatches: packageEvidence.contentHashMatches,
    };
  }).sort((left, right) => `${left.kind}:${left.revision}`.localeCompare(`${right.kind}:${right.revision}`));
  const uniquelyProven = candidates.length === 1
    && candidates[0]!.kind === "package"
    && candidates[0]!.packageRevisionRowMatches === 1
    && candidates[0]!.manifestMatches
    && candidates[0]!.contentHashMatches
    && candidates[0]!.references.includes("sdk_game_package_revisions.revision");
  if (uniquelyProven) {
    const candidate = candidates[0]!;
    return {
      head: {
        kind: candidate.kind,
        revision: candidate.revision,
        selectionEvidence: "independent_cross_evidence",
      } satisfies T131A4AuthoringHead,
      locator: related[0]!,
      evidence: {
        method: "INDEPENDENT_CROSS_EVIDENCE" as const,
        selectedRevision: candidate.revision,
        candidates,
        missingEvidence: [],
      },
    };
  }
  const missingEvidence = [
    ...(related.length === 0 ? ["GAME_ARTIFACT_LOCATOR"] : []),
    ...(related.every(({ kind }) => kind !== "mock") ? ["MOCK_LOCATOR"] : []),
    ...(related.every(({ kind }) => kind !== "package") ? ["PACKAGE_LOCATOR"] : []),
    ...(input.packageRows.every((row) => row.game_id !== input.gameRowId) ? ["PACKAGE_REVISION_ROW"] : []),
    ...(candidates.every(({ manifestMatches }) => !manifestMatches) ? ["MANIFEST_TO_REVISION_BINDING"] : []),
    ...(candidates.every(({ contentHashMatches }) => !contentHashMatches) ? ["CONTENT_HASH_TO_REVISION_BINDING"] : []),
    "MODULE_POLICY_TO_ARTIFACT_BINDING",
  ];
  return {
    head: null,
    locator: null,
    evidence: {
      method: "UNRESOLVED" as const,
      selectedRevision: null,
      candidates,
      missingEvidence: [...new Set(missingEvidence)].sort(),
    },
  };
}

export function createT131A4WorkspaceInventory(entries: readonly StoredZipEntry[]) {
  const files = new Map(entries.map((entry) => [entry.name, entry.content]));
  const manifestTargets = entries
    .map(({ name }) => /^git-artifacts\/([^/]+)\/manifest\.json$/.exec(name)?.[1])
    .filter((value): value is string => Boolean(value))
    .sort();
  if (manifestTargets.join("|") !== [...t131A4Targets].sort().join("|")) {
    fail("A4_EXACT_TWO_TARGET_SELECTION_MISMATCH");
  }
  if (entries.some(({ name }) => {
    const target = /^git-artifacts\/([^/]+)\//.exec(name)?.[1];
    return target && !t131A4Targets.includes(target as T131A4Target);
  })) fail("A4_EXACT_TWO_TARGET_SELECTION_MISMATCH");
  const inventories = t131A4Targets.map((target): T131A4TargetWorkspaceInventory => {
    const artifactManifestRaw = files.get(`git-artifacts/${target}/manifest.json`);
    if (!artifactManifestRaw) fail("A4_WORKSPACE_TARGET_MANIFEST_MISSING");
    let artifactManifest: OriginalDataPreservationArtifactManifest;
    try {
      artifactManifest = JSON.parse(artifactManifestRaw.toString("utf8")) as OriginalDataPreservationArtifactManifest;
    } catch {
      fail("A4_WORKSPACE_TARGET_MANIFEST_INVALID");
    }
    const targetSet = materializeT131A4TargetArtifactSet({
      entries,
      artifactManifest,
      target,
    });
    const creators = parseRows(files, target, "sdk_creators");
    const games = parseRows(files, target, "sdk_games");
    const packageRows = parseRows(files, target, "sdk_game_package_revisions");
    const releases = parseRows(files, target, "sdk_app_releases");
    if (creators.length !== 1 || creators[0]!.slug !== target || typeof creators[0]!.id !== "string") {
      fail("A4_WORKSPACE_CREATOR_RELATION_INVALID");
    }
    const creator = creators[0]!;
    const gameIds = games.map((row) => row.game_id);
    const gameRowIds = games.map((row) => row.id);
    if (
      games.some((row) => row.creator_id !== creator.id || typeof row.id !== "string" || !row.id)
      || gameIds.some((gameId) => typeof gameId !== "string" || !gameIdPattern.test(gameId))
      || new Set(gameIds).size !== gameIds.length
      || new Set(gameRowIds).size !== gameRowIds.length
    ) fail("A4_WORKSPACE_GAME_RELATION_INVALID");

    const inventoryGames = games.map((row): T131A4GameInventory => {
      const blockerCodes: string[] = [];
      const mockRevision = stringOrNull(row.mock_revision);
      const packageRevision = stringOrNull(row.package_revision);
      const gameId = String(row.game_id);
      const gameRowId = String(row.id);
      let head: T131A4AuthoringHead | null = null;
      let headLocator: T131A4ArtifactLocator | null = null;
      const crossEvidence = resolveIndependentAuthoringHead({
        gameId,
        gameRowId,
        gameManifest: row.manifest,
        locators: targetSet.locators,
        packageRows,
      });
      if (mockRevision) {
        head = {
          kind: "mock",
          revision: mockRevision,
          selectionEvidence: "sdk_games.mock_revision",
        };
      } else if (packageRevision) {
        head = {
          kind: "package",
          revision: packageRevision,
          selectionEvidence: "sdk_games.package_revision",
        };
      } else {
        head = crossEvidence.head;
        headLocator = crossEvidence.locator;
      }
      if (head && !headLocator) headLocator = exactHeadLocator(targetSet.locators, gameId, head);
      const headResolutionEvidence: T131A4GameInventory["headResolutionEvidence"] = head?.selectionEvidence === "independent_cross_evidence"
        ? crossEvidence.evidence
        : {
            method: head ? "EXPLICIT_DB_POINTER" : "UNRESOLVED",
            selectedRevision: head?.revision ?? null,
            candidates: crossEvidence.evidence.candidates,
            missingEvidence: head ? [] : crossEvidence.evidence.missingEvidence,
          };
      if (!head) blockerCodes.push("AUTHORING_HEAD_NOT_UNIQUELY_PROVEN");
      if (head && !headLocator) blockerCodes.push("AUTHORING_HEAD_ARTIFACT_LOCATOR_MISSING_OR_AMBIGUOUS");
      const revisionEvidence = head?.kind === "package"
        ? packageRow(packageRows, gameRowId, head.revision)
        : null;
      if (head?.kind === "package" && !revisionEvidence) {
        blockerCodes.push("AUTHORING_PACKAGE_REVISION_EVIDENCE_MISSING_OR_AMBIGUOUS");
      }
      const manifestConversion = head?.kind === "mock" && headLocator
        ? convertT131A4LegacyMockManifest({
            gameId,
            title: typeof row.title === "string" ? row.title : "",
            description: typeof row.description === "string" ? row.description : "",
            manifest: row.manifest,
            modulePolicy: row.module_policy ?? {},
            sdkContractVersion: integerOrNull(row.sdk_contract_version),
            locator: headLocator,
          })
        : null;
      const relatedLocators = targetSet.locators.filter((locator) => locator.gameId === gameId);
      const relatedPackageRows = packageRows.filter((candidate) => candidate.game_id === row.id);
      const relatedReleases = releases.filter((release) => (
        release.source_creator_slug === target && release.source_game_id === gameId
      ));
      return {
        target,
        gameRowId: String(row.id),
        gameId,
        title: typeof row.title === "string" ? row.title : "",
        description: typeof row.description === "string" ? row.description : "",
        manifest: manifestConversion?.currentManifest ?? row.manifest,
        legacyManifest: row.manifest,
        manifestConversion,
        modulePolicy: row.module_policy ?? {},
        sdkPackageVersion: stringOrNull(row.sdk_package_version),
        sdkContractVersion: integerOrNull(row.sdk_contract_version),
        status: stringOrNull(row.status),
        publicGameId: stringOrNull(row.public_game_id),
        deletedAt: stringOrNull(row.deleted_at),
        authoringPointers: {
          mockRevision,
          mockApprovedRevision: stringOrNull(row.mock_approved_revision),
          packageRevision,
          developmentRevision: stringOrNull(row.development_revision),
          stableRevision: stringOrNull(row.stable_revision),
        },
        head,
        headLocator,
        headResolutionEvidence,
        packageRevisionEvidence: revisionEvidence,
        ownerReference: stringOrNull(creator.owner_player_id),
        releaseReferences: relatedReleases.map(safeReleaseReference).sort((left, right) => (
          (left.id ?? "").localeCompare(right.id ?? "")
        )),
        channelProvenance: {
          packageRootSha256: stringOrNull(row.package_root_sha256),
          packageBundleSha256: stringOrNull(row.package_bundle_sha256),
          packageAppSetSha256: stringOrNull(row.package_app_set_sha256),
          developmentRootSha256: stringOrNull(row.development_root_sha256),
          developmentBundleSha256: stringOrNull(row.development_bundle_sha256),
          developmentAppSetSha256: stringOrNull(row.development_app_set_sha256),
          stableRootSha256: stringOrNull(row.stable_root_sha256),
          stableBundleSha256: stringOrNull(row.stable_bundle_sha256),
          stableAppSetSha256: stringOrNull(row.stable_app_set_sha256),
        },
        authoringMetadata: {
          mockApprovedAt: stringOrNull(row.mock_approved_at),
          moduleProfileRevision: stringOrNull(row.module_profile_revision),
          moduleContractDigest: stringOrNull(row.module_contract_digest),
          moduleProfileConfirmedAt: stringOrNull(row.module_profile_confirmed_at),
          prototypeModuleProfileRevision: stringOrNull(row.prototype_module_profile_revision),
          prototypeModuleContractDigest: stringOrNull(row.prototype_module_contract_digest),
          prototypeSdkPackageVersion: stringOrNull(row.prototype_sdk_package_version),
          prototypeSourceSha256: stringOrNull(row.prototype_source_sha256),
        },
        blockerCodes: [...new Set(blockerCodes)].sort(),
        deferred: {
          artifactLocatorCount: Math.max(0, relatedLocators.length - (headLocator ? 1 : 0)),
          packageRevisionCount: Math.max(0, relatedPackageRows.length - (revisionEvidence ? 1 : 0)),
          releaseCount: relatedReleases.length,
        },
      };
    }).sort((left, right) => left.gameId.localeCompare(right.gameId));
    return {
      target,
      creatorRowId: String(creator.id),
      creatorDisplayName: typeof creator.display_name === "string" ? creator.display_name : "",
      ownerReference: stringOrNull(creator.owner_player_id),
      games: inventoryGames,
      artifactLocatorCount: targetSet.locators.length,
      packageRevisionCount: packageRows.length,
      releaseCount: releases.length,
    };
  }) as [T131A4TargetWorkspaceInventory, T131A4TargetWorkspaceInventory];
  if (inventories.flatMap(({ games }) => games).length === 0) {
    fail("A4_WORKSPACE_GAME_INVENTORY_EMPTY");
  }
  return inventories;
}

function elementSnapshot(element: Element) {
  const interactive = element as Element & {
    value?: unknown;
    hidden?: unknown;
    disabled?: unknown;
  };
  return canonicalT131A4Json({
    textContent: element.textContent,
    innerHTML: element.innerHTML,
    value: interactive.value ?? null,
    hidden: interactive.hidden ?? false,
    disabled: interactive.disabled ?? false,
    childCount: element.childElementCount,
  });
}

function evidenceElement(document: Document, value: string) {
  const byId = document.getElementById(value);
  if (byId) return byId;
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return null;
  return document.querySelector(`[data-evidence~="${value}"]`);
}

function referencedAssets(html: string, css: string) {
  const references = new Set<string>();
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) references.add(match[1]!);
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) references.add(match[1]!);
  return [...references].filter((reference) => (
    reference && !reference.startsWith("#") && !reference.startsWith("data:")
  ));
}

async function smokeClient(
  files: readonly T131A4CurrentFormatFile[],
  gameId: string,
  requireInteraction: boolean,
) {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const textFilePattern = /\.(?:html?|css|[cm]?[jt]sx?|json|svg|txt|md)$/i;
  const assetAudit = auditGamePackageAssets(files.map((file) => ({
    path: file.path,
    content: textFilePattern.test(file.path)
      ? new TextDecoder("utf-8", { fatal: true }).decode(file.content)
      : file.content.toString("base64"),
    encoding: textFilePattern.test(file.path) ? "utf-8" as const : "base64" as const,
    bytes: file.bytes,
  })));
  if (!assetAudit.valid) throw new Error("CLIENT_REQUIRED_ASSET_CLOSURE_INVALID");
  const decode = (path: string) => {
    const content = byPath.get(path);
    if (!content) throw new Error("CLIENT_REQUIRED_FILE_MISSING");
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  };
  const html = decode("index.html");
  const css = byPath.has("styles.css") ? decode("styles.css") : "";
  const script = decode("mock.js");
  const reconstructionAdapter = byPath.has("reconstruction-adapter.json")
    ? JSON.parse(decode("reconstruction-adapter.json")) as {
        adapterVersion?: unknown;
        selectors?: { interaction?: unknown; inputSelector?: unknown };
      }
    : null;
  const references = referencedAssets(html, css);
  if (references.some((reference) => /^(?:https?:)?\/\//i.test(reference))) {
    throw new Error("CLIENT_NETWORK_DEPENDENCY_FORBIDDEN");
  }
  for (const reference of references) {
    const path = reference.replace(/^\.\//, "").split(/[?#]/, 1)[0]!;
    if (path && !byPath.has(path)) throw new Error("CLIENT_REQUIRED_ASSET_MISSING");
  }
  let quality: ReturnType<typeof validateGameSdkMockQuality> | null = null;
  if (byPath.has("preview.json")) {
    quality = validateGameSdkMockQuality({
      files: {
        "index.html": html,
        "styles.css": css,
        "mock.js": script,
        "preview.json": decode("preview.json"),
      },
    });
    if (quality.gameId !== gameId) throw new Error("CLIENT_GAME_ID_MISMATCH");
  }
  const { document, window } = parseHTML(html);
  const storage = new Map<string, string>();
  const room = {
    __t131A4Reconstruction: true,
    sentCommands: [] as unknown[],
    subscribe(listener: (value: unknown) => void) {
      listener({ phase: "lobby", view: { common: { phase: "lobby", players: [] }, app: null } });
      return () => undefined;
    },
    async send(command: unknown) {
      this.sentCommands.push(command);
      return { ok: true };
    },
  };
  const noNetwork = () => { throw new Error("CLIENT_NETWORK_DEPENDENCY_FORBIDDEN"); };
  const sandbox: Record<string, unknown> = {
    document,
    navigator: window.navigator,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
    },
    GameFieldsRoom: room,
    console: { log() {}, warn() {}, error() {} },
    requestAnimationFrame: (callback: () => unknown) => callback(),
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval() {},
    fetch: noNetwork,
    WebSocket: class { constructor() { throw new Error("CLIENT_NETWORK_DEPENDENCY_FORBIDDEN"); } },
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
  };
  Object.assign(window, {
    GameFieldsRoom: room,
    fetch: noNetwork,
    WebSocket: sandbox.WebSocket,
    requestAnimationFrame: sandbox.requestAnimationFrame,
    cancelAnimationFrame: sandbox.cancelAnimationFrame,
  });
  sandbox.window = window;
  sandbox.self = window;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const scriptPaths = [...document.querySelectorAll("script[src]")].map((element) => (
    element.getAttribute("src")?.replace(/^\.\//, "").split(/[?#]/, 1)[0] ?? ""
  ));
  if (scriptPaths.length === 0 || scriptPaths.some((path) => !path || !byPath.has(path))) {
    throw new Error("CLIENT_SCRIPT_ENTRY_MISSING");
  }
  for (const path of scriptPaths) {
    new vm.Script(decode(path), { filename: path }).runInContext(sandbox, { timeout: 250 });
  }
  document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  window.dispatchEvent(new window.Event("DOMContentLoaded"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (!quality || !requireInteraction) {
    return { interaction: "NOT_REQUIRED" as const, presentation: "NOT_REQUIRED" as const };
  }
  const action = quality.evidence.primaryActions[0]!;
  const target = evidenceElement(document, action.targetId);
  const result = evidenceElement(document, action.observableResultId);
  if (!target || !result) {
    throw new Error("CLIENT_PRIMARY_INTERACTION_TARGET_MISSING");
  }
  const before = elementSnapshot(result);
  if (!reconstructionAdapter) {
    target.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (elementSnapshot(result) === before) {
      throw new Error("CLIENT_PRIMARY_INTERACTION_NO_STATE_CHANGE");
    }
    return { interaction: "PASS" as const, presentation: "NOT_REQUIRED" as const };
  }
  const sourceObservable = evidenceElement(document, "t131-source-observable");
  if (!sourceObservable) throw new Error("CLIENT_SOURCE_OBSERVABLE_MISSING");
  const sourceBefore = elementSnapshot(sourceObservable);
  const commandCountBefore = room.sentCommands.length;
  if (typeof reconstructionAdapter?.selectors?.inputSelector === "string") {
    const input = document.querySelector(reconstructionAdapter.selectors.inputSelector) as Element & { value?: unknown };
    if (!input) throw new Error("CLIENT_PRIMARY_INTERACTION_INPUT_MISSING");
    input.value = "local reconstruction smoke";
  }
  await Promise.race([
    Promise.resolve().then(() => {
      target.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
      if (reconstructionAdapter?.selectors?.interaction === "submit") {
        const form = target.closest("form");
        if (!form) throw new Error("CLIENT_PRIMARY_INTERACTION_FORM_MISSING");
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      }
    }),
    new Promise<never>((_resolve, reject) => setTimeout(
      () => reject(new Error("CLIENT_PRIMARY_INTERACTION_TIMEOUT")),
      250,
    )),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (elementSnapshot(result) === before) throw new Error("CLIENT_PRIMARY_INTERACTION_NO_STATE_CHANGE");
  if (
    elementSnapshot(sourceObservable) === sourceBefore
    && room.sentCommands.length === commandCountBefore
  ) throw new Error("CLIENT_SOURCE_INTERACTION_NOT_OBSERVED");
  const reset = evidenceElement(document, quality.evidence.resetAction.targetId);
  if (!reset) throw new Error("CLIENT_RESET_INTERACTION_TARGET_MISSING");
  reset.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (elementSnapshot(result) !== before) throw new Error("CLIENT_RESET_STATE_RECONCILIATION_FAILED");
  return { interaction: "PASS" as const, presentation: "PASS" as const };
}

function actor(playerId: string, role: "host" | "player") {
  return { playerId, displayName: role === "host" ? "Host" : "Player", role, debugAccess: false } as const;
}

function assertServerStatePresentation(
  room: Record<string, unknown>,
  view: { common?: Record<string, unknown> },
) {
  if (
    !room || typeof room !== "object"
    || !view || typeof view !== "object"
    || !view.common || typeof view.common !== "object"
    || (typeof room.phase === "string" && view.common.phase !== room.phase)
    || (Array.isArray(room.players) && Array.isArray(view.common.players)
      && room.players.length !== view.common.players.length)
  ) throw new Error("SERVER_STATE_PRESENTATION_MISMATCH");
}

async function smokeServer(
  files: readonly T131A4CurrentFormatFile[],
  game: T131A4GameInventory,
  definitionSmokeSequence: readonly T131A4DefinitionSmokeStep[] = [],
) {
  const bundleFile = files.find(({ path }) => path === "server.bundle.js");
  if (!bundleFile) throw new Error("SERVER_BUNDLE_MISSING");
  const bundle = new TextDecoder("utf-8", { fatal: true }).decode(bundleFile.content);
  const manifestResult = await runGameSdkPortableServer({
    bundle,
    request: {
      version: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
      invocation: { operation: "manifest" },
      effects: {},
    },
  });
  if (!manifestResult.ok || canonicalT131A4Json(manifestResult.value) !== canonicalT131A4Json(game.manifest)) {
    throw new Error("SERVER_MANIFEST_MISMATCH");
  }
  const createResult = await runGameSdkPortableServer({
    bundle,
    request: {
      version: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
      invocation: {
        operation: "createRoom",
        input: {
          create: { app: {} },
          context: {
            actor: actor("local-host", "host"),
            now: 1_000,
            requestId: "t131-a4-local-create",
            roomCode: "LOCAL",
          },
        },
      },
      effects: {},
    },
  });
  if (!createResult.ok || !createResult.value || typeof createResult.value !== "object") {
    throw new Error("SERVER_INITIALIZATION_FAILED");
  }
  const result = await runGameSdkPortableCommandBatch({
    bundle,
    request: {
      kind: "game-fields-command-batch-v1",
      apply: {
        version: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
        invocation: {
          operation: "applyCommand",
          input: {
            room: createResult.value,
            command: { type: "room/join" },
            context: {
              actor: actor("local-player", "player"),
              now: 2_000,
              requestId: "t131-a4-local-basic-command",
            },
          },
        },
        effects: {},
      },
      presentationContext: {
        viewer: actor("local-host", "host"),
        now: 2_000,
      },
    },
  });
  if (!result.ok) throw new Error("SERVER_BASIC_COMMAND_FAILED");
  let room = result.value.room as Record<string, unknown>;
  let view = result.value.view as { common?: Record<string, unknown> };
  assertServerStatePresentation(room, view);
  for (const [index, step] of definitionSmokeSequence.entries()) {
    const before = canonicalT131A4Json(room);
    const stepped = await runGameSdkPortableCommandBatch({
      bundle,
      request: {
        kind: "game-fields-command-batch-v1",
        apply: {
          version: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
          invocation: {
            operation: "applyCommand",
            input: {
              room,
              command: step.command,
              context: {
                actor: step.actor === "host"
                  ? actor("local-host", "host")
                  : actor("local-player", "player"),
                now: 3_000 + index,
                requestId: `t131-a4-definition-smoke-${index + 1}`,
              },
            },
          },
          effects: {},
        },
        presentationContext: {
          viewer: actor("local-host", "host"),
          now: 3_000 + index,
        },
      },
    });
    if (!stepped.ok) throw new Error("SERVER_DEFINITION_INTERACTION_FAILED");
    room = stepped.value.room as Record<string, unknown>;
    view = stepped.value.view as { common?: Record<string, unknown> };
    if (canonicalT131A4Json(room) === before) {
      throw new Error("SERVER_DEFINITION_INTERACTION_NO_STATE_CHANGE");
    }
    assertServerStatePresentation(room, view);
  }
}

export const defaultT131A4RuntimeSmoke: T131A4RuntimeSmoke = async ({
  game,
  files,
  runtimeKind = game.head?.kind,
  definitionSmokeSequence = [],
}) => {
  const blockers: string[] = [];
  let manifestValidation: T131A4GameSmokeResult["manifestValidation"] = "FAIL";
  let clientBoot: T131A4GameSmokeResult["clientBoot"] = "FAIL";
  let serverInitialization: T131A4GameSmokeResult["serverInitialization"] = "NOT_REQUIRED";
  let statePresentation: T131A4GameSmokeResult["statePresentationReconciliation"] = "NOT_REQUIRED";
  let interaction: T131A4GameSmokeResult["basicInteraction"] = "FAIL";
  try {
    if (!game.manifest || typeof game.manifest !== "object") {
      throw new Error("manifest");
    }
    const manifest = game.manifest as GameSdkManifest;
    assertGameManifest(manifest);
    if (manifest.id !== game.gameId) throw new Error("manifest-id");
    manifestValidation = "PASS";
  } catch {
    blockers.push("GAME_MANIFEST_VALIDATION_FAILED");
  }
  try {
    const client = await smokeClient(files, game.gameId, runtimeKind === "mock");
    clientBoot = "PASS";
    if (client.interaction === "PASS") interaction = "PASS";
    if (client.presentation === "PASS") statePresentation = "PASS";
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : "CLIENT_BOOT_FAILED");
  }
  if (runtimeKind === "package") {
    try {
      await smokeServer(files, game, definitionSmokeSequence);
      serverInitialization = "PASS";
      statePresentation = "PASS";
      interaction = "PASS";
    } catch (error) {
      serverInitialization = "FAIL";
      statePresentation = "FAIL";
      blockers.push(error instanceof Error ? error.message : "SERVER_RUNTIME_SMOKE_FAILED");
    }
  }
  return {
    manifestValidation,
    clientBoot,
    serverInitialization,
    basicInteraction: interaction,
    statePresentationReconciliation: statePresentation,
    requiredAssets: blockers.some((code) => code.includes("ASSET")) ? "FAIL" : "PASS",
    networkDependency: "NONE",
    blockerCodes: [...new Set(blockers)].sort(),
  };
};

function packageEvidenceMismatches(
  game: T131A4GameInventory,
  compatibility: Awaited<ReturnType<typeof classifyT131A4Locator>>,
) {
  if (game.head?.kind !== "package" || !game.packageRevisionEvidence) return [];
  const evidence = game.packageRevisionEvidence;
  const mismatches: string[] = [];
  if (evidence.package_root_sha256 !== compatibility.packageRootSha256) {
    mismatches.push("PACKAGE_ROOT_SHA256_EVIDENCE_MISMATCH");
  }
  if (evidence.server_bundle_sha256 !== compatibility.serverBundleSha256) {
    mismatches.push("SERVER_BUNDLE_SHA256_EVIDENCE_MISMATCH");
  }
  if (evidence.app_set_source_sha256 !== compatibility.appSetSourceSha256) {
    mismatches.push("APP_SET_SHA256_EVIDENCE_MISMATCH");
  }
  if (canonicalT131A4Json(evidence.manifest) !== canonicalT131A4Json(game.manifest)) {
    mismatches.push("PACKAGE_MANIFEST_DB_EVIDENCE_MISMATCH");
  }
  return mismatches;
}

function safePackageEvidence(row: JsonRow | null) {
  if (!row) return null;
  return {
    revision: row.revision,
    packageRootSha256: row.package_root_sha256,
    serverBundleSha256: row.server_bundle_sha256,
    appSetSourceSha256: row.app_set_source_sha256,
    sdkPackageVersion: row.sdk_package_version,
    sdkContractVersion: row.sdk_contract_version,
    prototypeRevision: row.prototype_revision ?? null,
    sharedSourceSha256: row.shared_source_sha256 ?? null,
    moduleProfileRevision: row.module_profile_revision ?? null,
    moduleContractDigest: row.module_contract_digest ?? null,
  };
}

function gameWorkspaceDocument(
  game: T131A4GameInventory,
  ledger: T131A4PerGameLedger,
  files: readonly T131A4CurrentFormatFile[],
  definitionRebuild: T131A4DefinitionBackedRebuild | null,
) {
  const locator = game.headLocator;
  return {
    schemaVersion: 1,
    target: game.target,
    gameRowId: game.gameRowId,
    gameId: game.gameId,
    title: game.title,
    description: game.description,
    manifest: definitionRebuild?.currentManifest ?? game.manifest,
    legacyManifest: game.legacyManifest,
    manifestConversion: game.manifestConversion?.evidence ?? null,
    modulePolicy: game.modulePolicy,
    sdkPackageVersion: game.sdkPackageVersion,
    sdkContractVersion: game.sdkContractVersion,
    status: game.status,
    publicGameId: game.publicGameId,
    deletedAt: game.deletedAt,
    ownerReference: game.ownerReference,
    authoringPointers: game.authoringPointers,
    authoringMetadata: game.authoringMetadata,
    channelProvenance: game.channelProvenance,
    authoringHead: game.head,
    headResolutionEvidence: game.headResolutionEvidence,
    packageRevisionEvidence: safePackageEvidence(game.packageRevisionEvidence),
    releaseReferences: game.releaseReferences,
    runtimeSmoke: ledger.smoke,
    definitionBackedRebuild: definitionRebuild ? {
      mode: definitionRebuild.rebuildMode,
      rebuilderVersion: definitionRebuild.rebuilderVersion,
      canonicalInputSha256: definitionRebuild.canonicalInputSha256,
      canonicalOutputSha256: definitionRebuild.canonicalOutputSha256,
      definitionEvidenceSha256: definitionRebuild.definitionEvidenceSha256,
      packageRootSha256: definitionRebuild.packageRootSha256,
      serverBundleSha256: definitionRebuild.serverBundleSha256,
      appSetSourceSha256: definitionRebuild.appSetSourceSha256,
      historicalArtifactHead: "ABSENT",
      historicalRestorationClaim: false,
    } : null,
    provenance: locator ? {
      originalRevision: locator.originalRevision,
      originalTreeSha: locator.originalTreeSha,
      originalSourcePrefix: locator.sourcePrefix,
      references: locator.references,
      originalToCurrent: locator.files.map((source) => ({
        sourcePath: source.sourcePath,
        archivePath: source.archivePath,
        originalGitBlobSha: source.blobSha,
        originalSha256: source.contentSha256,
        outputs: files
          .filter((output) => ledger.compatibilityClass === "DIRECTLY_VALID"
            ? `${locator.sourcePrefix}${output.path}` === source.sourcePath
            : true)
          .map((output) => ({
            workspacePath: `runtime/${output.path}`,
            futureStoragePath: `${locator.sourcePrefix}${output.path}`,
            bytes: output.bytes,
            sha256: output.sha256,
          })),
      })),
    } : definitionRebuild ? {
      kind: "DEFINITION_BACKED_SEMANTIC_REBUILD",
      exactA0DefinitionSha256: definitionRebuild.canonicalInputSha256,
      definitionEvidenceSha256: definitionRebuild.definitionEvidenceSha256,
      historicalArtifactHead: "ABSENT",
    } : null,
    deferredHistoricalMaterial: game.deferred,
    historicalRestorationClaim: false,
    externalWrites: 0,
  };
}

async function createWorkspaceBundle(input: {
  inventory: T131A4TargetWorkspaceInventory;
  archiveCommitment: { bytes: number; sha256: string };
  rebuildPackage?: T131A4PackageRebuilder;
  runtimeSmoke: T131A4RuntimeSmoke;
}) {
  const ledger: T131A4PerGameLedger[] = [];
  const entries: Array<{ name: string; content: Uint8Array | string }> = [];
  for (const game of input.inventory.games) {
    let blockers = [...game.blockerCodes];
    let compatibility: Awaited<ReturnType<typeof classifyT131A4Locator>> | null = null;
    let definitionRebuild: T131A4DefinitionBackedRebuild | null = null;
    let smoke: T131A4GameSmokeResult | null = null;
    let authoringAdapterVersion: typeof t131A4AuthoringMockAdapterVersion | null = null;
    let authoringAdapterEvidenceSha256: string | null = null;
    const definitionEligible = game.target === "moi-lab2"
      && game.gameId === "quarto"
      && game.head === null
      && game.headLocator === null;
    if (definitionEligible) {
      try {
        definitionRebuild = await rebuildT131A4DefinitionBackedQuarto(game);
        blockers = blockers.filter((code) => code !== "AUTHORING_HEAD_NOT_UNIQUELY_PROVEN");
      } catch (error) {
        blockers.push(error instanceof Error
          ? error.message.split(":", 1)[0]!
          : "A4_QUARTO_DEFINITION_REBUILD_FAILED");
      }
    } else if (blockers.length === 0 && game.headLocator) {
      if (game.head?.kind === "mock" && game.manifestConversion) {
        try {
          const adapted = normalizeT131A4LegacyMock({
            locator: game.headLocator,
            manifestConversion: game.manifestConversion,
          });
          if (adapted) {
            authoringAdapterVersion = adapted.adapterVersion;
            authoringAdapterEvidenceSha256 = adapted.evidenceSha256;
            compatibility = classifyT131A4NormalizedMock(game.headLocator, adapted.files);
          }
        } catch (error) {
          blockers.push(error instanceof Error
            ? error.message.split(":", 1)[0]!
            : "LEGACY_MOCK_ADAPTER_FAILED");
        }
      } else if (game.head?.kind === "mock") {
        blockers.push("LEGACY_MANIFEST_CONVERSION_EVIDENCE_MISSING");
      }
      compatibility ??= await classifyT131A4Locator(game.headLocator, input.rebuildPackage);
      if (compatibility.classification === "UNAVAILABLE_FOR_FAITHFUL_RECONSTRUCTION") {
        blockers.push(compatibility.reason);
      } else {
        blockers.push(...packageEvidenceMismatches(game, compatibility));
      }
    }
    const runtimeFiles = definitionRebuild?.files ?? compatibility?.files ?? null;
    const runtimeKind = definitionRebuild ? "package" as const : game.head?.kind;
    if (blockers.length === 0 && runtimeFiles && runtimeKind) {
      const runtimeGame = definitionRebuild
        ? { ...game, manifest: definitionRebuild.currentManifest }
        : game;
      smoke = await input.runtimeSmoke({
        game: runtimeGame,
        files: runtimeFiles,
        runtimeKind,
        definitionSmokeSequence: definitionRebuild?.smokeSequence,
      });
        blockers.push(...smoke.blockerCodes);
        if (
          smoke.manifestValidation !== "PASS"
          || smoke.clientBoot !== "PASS"
          || smoke.basicInteraction !== "PASS"
          || (authoringAdapterVersion !== null
            && smoke.statePresentationReconciliation !== "PASS")
          || smoke.requiredAssets !== "PASS"
          || (runtimeKind === "package" && (
            smoke.serverInitialization !== "PASS"
          ))
        ) blockers.push("PER_GAME_RUNTIME_SMOKE_INCOMPLETE");
    }
    const uniqueBlockers = [...new Set(blockers)].sort();
    const ready = uniqueBlockers.length === 0
      && (compatibility !== null || definitionRebuild !== null);
    const gameLedger: T131A4PerGameLedger = {
      target: game.target,
      gameRowId: game.gameRowId,
      gameId: game.gameId,
      authoringHead: game.head,
      reconstruction: ready ? "READY" : "BLOCKED",
      reconstructionMode: definitionRebuild
        ? "DEFINITION_BACKED_SEMANTIC_REBUILD"
        : compatibility ? "ARTIFACT_HEAD" : null,
      compatibilityClass: definitionRebuild?.rebuildMode ?? compatibility?.classification ?? null,
      converterVersion: compatibility?.converterVersion ?? null,
      authoringAdapterVersion,
      authoringAdapterEvidenceSha256,
      definitionRebuilderVersion: definitionRebuild?.rebuilderVersion ?? null,
      definitionEvidenceSha256: definitionRebuild?.definitionEvidenceSha256 ?? null,
      manifestConversionSha256: game.manifestConversion?.evidence.currentManifestSha256 ?? null,
      canonicalInputSha256: definitionRebuild?.canonicalInputSha256
        ?? compatibility?.canonicalInputSha256
        ?? null,
      originalRevision: game.head?.revision ?? null,
      currentOutputSha256: definitionRebuild?.canonicalOutputSha256
        ?? compatibility?.canonicalOutputSha256
        ?? null,
      packageRootSha256: definitionRebuild?.packageRootSha256
        ?? compatibility?.packageRootSha256
        ?? null,
      serverBundleSha256: definitionRebuild?.serverBundleSha256
        ?? compatibility?.serverBundleSha256
        ?? null,
      appSetSourceSha256: definitionRebuild?.appSetSourceSha256
        ?? compatibility?.appSetSourceSha256
        ?? null,
      smoke,
      headResolutionEvidence: game.headResolutionEvidence,
      blockerCodes: uniqueBlockers,
      deferred: game.deferred,
    };
    ledger.push(gameLedger);
    const outputFiles = ready ? runtimeFiles! : [];
    entries.push({
      name: `games/${game.gameId}/workspace.json`,
      content: t131A4JsonDocument(gameWorkspaceDocument(
        game,
        gameLedger,
        outputFiles,
        definitionRebuild,
      )),
    });
    for (const file of outputFiles) {
      entries.push({
        name: `games/${game.gameId}/runtime/${file.path}`,
        content: file.content,
      });
    }
  }
  if (ledger.length !== input.inventory.games.length) fail("A4_PER_GAME_LEDGER_INCOMPLETE");
  const readyGameCount = ledger.filter(({ reconstruction }) => reconstruction === "READY").length;
  const blockedGameCount = ledger.length - readyGameCount;
  const ledgerBytes = t131A4JsonDocument({
    schemaVersion: 1,
    target: input.inventory.target,
    games: ledger,
  });
  const deferredBytes = t131A4JsonDocument({
    schemaVersion: 1,
    target: input.inventory.target,
    totalArtifactLocators: input.inventory.artifactLocatorCount,
    totalPackageRevisions: input.inventory.packageRevisionCount,
    totalReleaseReferences: input.inventory.releaseCount,
    games: input.inventory.games.map((game) => ({ gameId: game.gameId, ...game.deferred })),
  });
  const manifest = {
    schemaVersion: 1,
    phaseId: t131A4PhaseId,
    artifactType: "PRIVATE_LOCAL_AUTHORING_WORKSPACE_BUNDLE",
    target: input.inventory.target,
    localParent: t131A4LocalParent,
    a0: { ...input.archiveCommitment, sourceMainCommit: t131A4A0SourceMainCommit },
    creatorRowId: input.inventory.creatorRowId,
    creatorDisplayName: input.inventory.creatorDisplayName,
    ownerReference: input.inventory.ownerReference,
    gameCount: ledger.length,
    readyGameCount,
    blockedGameCount,
    perGameLedgerSha256: sha256(ledgerBytes),
    deferredHistoricalMaterialSha256: sha256(deferredBytes),
    state: blockedGameCount === 0
      ? "LOCAL_AUTHORING_WORKSPACE_READY"
      : "AUTHORING_WORKSPACE_INCOMPLETE",
    transferAuthorized: false,
    ownerBindingApplied: false,
    releasePublicationApplied: false,
    externalWrites: 0,
    recoveryBoundary: input.inventory.target === "moi-lab2"
      ? {
          sourceEvidence: "T-131-A3",
          ...t131A4A3SourceProof,
        }
      : {
          sourceEvidence: "T-173",
          contentReconstructionOnly: true,
          runtimeProjection: "READ_ONLY_RECONCILIATION_REQUIRED",
          ownerMapping: "SEPARATE_AUTHORIZATION_REQUIRED",
          visibility: "NOT_APPLIED",
        },
  } as const;
  const archive = createStoredZip([
    { name: "workspace-manifest.json", content: t131A4JsonDocument(manifest) },
    { name: "per-game-ledger.json", content: ledgerBytes },
    { name: "deferred-historical-material.json", content: deferredBytes },
    ...entries,
  ].sort((left, right) => left.name.localeCompare(right.name)));
  return {
    target: input.inventory.target,
    archive,
    archiveSha256: sha256(archive),
    gameLedger: ledger,
    readyGameCount,
    blockedGameCount,
  } satisfies T131A4WorkspaceBundle;
}

export async function reconstructT131A4AuthoringStateFromVerifiedEntries(input: {
  entries: readonly StoredZipEntry[];
  archiveCommitment: { bytes: number; sha256: string };
  rebuildPackage?: T131A4PackageRebuilder;
  runtimeSmoke?: T131A4RuntimeSmoke;
}): Promise<T131A4AuthoringStateResult> {
  const inventories = createT131A4WorkspaceInventory(input.entries);
  const workspaces = await Promise.all(inventories.map((inventory) => createWorkspaceBundle({
    inventory,
    archiveCommitment: input.archiveCommitment,
    rebuildPackage: input.rebuildPackage,
    runtimeSmoke: input.runtimeSmoke ?? defaultT131A4RuntimeSmoke,
  }))) as [T131A4WorkspaceBundle, T131A4WorkspaceBundle];
  const gameCount = workspaces.reduce((total, workspace) => total + workspace.gameLedger.length, 0);
  const readyGameCount = workspaces.reduce((total, workspace) => total + workspace.readyGameCount, 0);
  const blockedGameCount = gameCount - readyGameCount;
  const allRuntimeSmokesPass = gameCount === 7 && workspaces
    .flatMap(({ gameLedger }) => gameLedger)
    .every((game) => (
      game.reconstruction === "READY"
      && game.smoke?.manifestValidation === "PASS"
      && game.smoke.clientBoot === "PASS"
      && game.smoke.basicInteraction === "PASS"
      && game.smoke.statePresentationReconciliation === "PASS"
      && game.smoke.requiredAssets === "PASS"
      && game.smoke.blockerCodes.length === 0
      && (game.packageRootSha256 === null || game.smoke.serverInitialization === "PASS")
    ));
  const aggregateLedger: T131A4AuthoringStateResult["aggregateLedger"] = {
    schemaVersion: 1,
    phaseId: t131A4PhaseId,
    localParent: t131A4LocalParent,
    a0SourceMainCommit: t131A4A0SourceMainCommit,
    targetCount: 2,
    gameCount,
    readyGameCount,
    blockedGameCount,
    targets: workspaces.map((workspace) => ({
      target: workspace.target,
      gameCount: workspace.gameLedger.length,
      readyGameCount: workspace.readyGameCount,
      blockedGameCount: workspace.blockedGameCount,
      workspaceBundleSha256: workspace.archiveSha256,
    })),
    state: blockedGameCount === 0
      ? "LOCAL_TWO_CLIENT_AUTHORING_STATE_RECONSTRUCTION_READY"
      : "AUTHORING_STATE_RECONSTRUCTION_INCOMPLETE",
    runtimeSmoke: allRuntimeSmokesPass
      ? "ALL_SEVEN_GAMES_RUNTIME_SMOKE_PASS"
      : "PER_GAME_RUNTIME_SMOKE_INCOMPLETE",
    externalWrites: 0,
  };
  const aggregateLedgerBytes = t131A4JsonDocument(aggregateLedger);
  const stagedRecoveryPlan = [
    "# T-131-A4 staged recovery plan",
    "",
    "ARTIFACT_TYPE: DRAFT — NOT AUTHORIZED FOR EXECUTION",
    "",
    "1. Transfer each target workspace bundle only after explicit authorization.",
    "2. Import into separate private Development workspaces and accept every game independently.",
    "3. Reconstruct Production content as non-public artifacts with non-force CAS and exact read-back.",
    "4. Verify ownership read-only before any separately authorized owner rebinding.",
    "5. Restore release or publication state only after explicit per-client authorization.",
    "",
    "Every external stage must preserve unrelated paths, assign new operation identities, and use exact post-write read-back. This draft authorizes no transfer or write.",
    "",
  ].join("\n");
  return { workspaces, aggregateLedger, aggregateLedgerBytes, stagedRecoveryPlan };
}

export async function prepareT131A4AuthoringStateReconstruction(input: {
  archive: Uint8Array;
  rebuildPackage?: T131A4PackageRebuilder;
  runtimeSmoke?: T131A4RuntimeSmoke;
}) {
  const verified = verifyT131A4FixedArchive(input.archive);
  return reconstructT131A4AuthoringStateFromVerifiedEntries({
    entries: verified.entries,
    archiveCommitment: verified.archiveCommitment,
    rebuildPackage: input.rebuildPackage,
    runtimeSmoke: input.runtimeSmoke,
  });
}
