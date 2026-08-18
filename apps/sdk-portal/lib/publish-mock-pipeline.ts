import { createHash, randomUUID } from "node:crypto";
import { appendModuleUsageReview } from "./module-usage-review.ts";
import { buildNodeFreeGamePackage } from "./node-free-game-package.ts";
import { parseSdkMockPreviewManifest } from "./mock-preview-manifest.ts";
import { saveMockFilesToGit } from "./mock-git-store.ts";
import { ensureSdkSchema, sdkSql } from "./sdk-postgres.ts";
import {
  sharedGameSourceSha256,
} from "./module-authoring-contract.ts";
import type {
  GameSdkModuleBinding,
  GameSdkModuleUsageAudit,
} from "@game-fields/game-sdk/module-usage";

type PublishMockContract = {
  moduleProfileRevision: string;
  moduleContractDigest: string;
  sdkPackage: { version: string };
};

export type PublishMockPipelineInput = {
  creatorId: string;
  creatorSlug: string;
  gameId: string;
  title: string;
  description: string;
  manifest: unknown;
  files: Record<string, string>;
  contract: PublishMockContract;
  usageAudit: GameSdkModuleUsageAudit;
};

export type PublishMockPipelineResult = {
  saved: true;
  gameId: string;
  prototypeRevision: string;
  mockRevision: string;
  qualityEvidence: ReturnType<typeof parseSdkMockPreviewManifest>["reviewEvidence"];
  moduleBinding: GameSdkModuleBinding;
  moduleUsage: GameSdkModuleUsageAudit["moduleUsage"];
  sharedSourceSha256: string;
};

export type PublishMockPipelineDependencies = {
  ensureSchema?: typeof ensureSdkSchema;
  sql?: ReturnType<typeof sdkSql>;
  build?: typeof buildNodeFreeGamePackage;
  saveGit?: typeof saveMockFilesToGit;
  parseManifest?: typeof parseSdkMockPreviewManifest;
  sourceHash?: typeof sharedGameSourceSha256;
};

export class PublishMockPipelineError extends Error {
  readonly code: string;
  readonly layer: "validation" | "store" | "handler";
  readonly operation: string;
  readonly correlationId: string;
  readonly revision?: string;

  constructor(input: {
    code: string;
    message: string;
    layer: "validation" | "store" | "handler";
    operation: string;
    revision?: string;
  }) {
    super(input.message);
    this.name = "PublishMockPipelineError";
    this.code = input.code;
    this.layer = input.layer;
    this.operation = input.operation;
    this.correlationId = `pmk-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    this.revision = input.revision;
  }
}

function pipelineError(input: ConstructorParameters<typeof PublishMockPipelineError>[0], cause?: unknown): PublishMockPipelineError {
  if (cause instanceof PublishMockPipelineError) return cause;
  return new PublishMockPipelineError(input);
}

function safeSha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function titleDescriptionKey(input: Pick<PublishMockPipelineInput, "title" | "description">) {
  return safeSha256(`${input.title}\n${input.description}`);
}

async function findExistingRevision(
  input: PublishMockPipelineInput,
  database: ReturnType<typeof sdkSql>,
  sourceSha256: string,
) {
  const rows = await database`
    SELECT mock_revision AS "mockRevision",
           prototype_source_sha256 AS "sharedSourceSha256",
           title,
           description
    FROM sdk_games
    WHERE creator_id = ${input.creatorId}
      AND game_id = ${input.gameId}
      AND module_profile_revision = ${input.contract.moduleProfileRevision}::uuid
      AND module_contract_digest = ${input.contract.moduleContractDigest}
      AND prototype_source_sha256 = ${sourceSha256}
      AND mock_revision IS NOT NULL
      AND module_profile_confirmed_at IS NOT NULL
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as {
    mockRevision?: unknown;
    sharedSourceSha256?: unknown;
    title?: unknown;
    description?: unknown;
  } | null;
  return row
    && typeof row.mockRevision === "string"
    && typeof row.sharedSourceSha256 === "string"
    && row.sharedSourceSha256 === sourceSha256
    && typeof row.title === "string"
    && typeof row.description === "string"
    && titleDescriptionKey({ title: row.title, description: row.description }) === titleDescriptionKey(input)
    ? row.mockRevision
    : null;
}

export async function publishMockPipeline(
  input: PublishMockPipelineInput,
  dependencies: PublishMockPipelineDependencies = {},
): Promise<PublishMockPipelineResult> {
  const build = dependencies.build ?? buildNodeFreeGamePackage;
  const saveGit = dependencies.saveGit ?? saveMockFilesToGit;
  const parseManifest = dependencies.parseManifest ?? parseSdkMockPreviewManifest;
  const sourceHash = dependencies.sourceHash ?? sharedGameSourceSha256;
  const ensureSchema = dependencies.ensureSchema ?? ensureSdkSchema;

  let builtPrototype: Awaited<ReturnType<typeof build>>;
  try {
    builtPrototype = await build({
      gameId: input.gameId,
      manifest: input.manifest,
      files: input.files,
      moduleBinding: input.usageAudit.binding,
    });
  } catch (error) {
    throw pipelineError({
      code: "SDK_PROTOTYPE_BUILD_FAILED",
      message: "prototype build failed.",
      layer: "validation",
      operation: "prototype-build",
    }, error);
  }

  let sourceSha256: string;
  let prototypeFiles: typeof builtPrototype.prototypeFiles;
  try {
    sourceSha256 = sourceHash(input.files);
    prototypeFiles = appendModuleUsageReview(
      builtPrototype.prototypeFiles,
      input.usageAudit,
    );
  } catch (error) {
    throw pipelineError({
      code: "SDK_PROTOTYPE_FILE_PREPARATION_FAILED",
      message: "prototype files failed preparation.",
      layer: "validation",
      operation: "prototype-file-preparation",
    }, error);
  }
  let manifest: ReturnType<typeof parseManifest>;
  try {
    manifest = parseManifest(input.gameId, prototypeFiles);
  } catch (error) {
    throw pipelineError({
      code: "SDK_PROTOTYPE_FILE_PREPARATION_FAILED",
      message: "prototype files failed preparation.",
      layer: "validation",
      operation: "prototype-file-preparation",
    }, error);
  }

  let database: ReturnType<typeof sdkSql>;
  try {
    await ensureSchema();
    database = dependencies.sql ?? sdkSql();
  } catch (error) {
    throw pipelineError({
      code: "SDK_PROTOTYPE_DB_UPDATE_FAILED",
      message: "prototype database boundary is unavailable.",
      layer: "store",
      operation: "mock-revision-schema",
    }, error);
  }

  let existingRevision: string | null;
  try {
    existingRevision = await findExistingRevision(input, database, sourceSha256);
  } catch (error) {
    throw pipelineError({
      code: "SDK_PROTOTYPE_DB_UPDATE_FAILED",
      message: "prototype database lookup failed.",
      layer: "store",
      operation: "mock-revision-lookup",
    }, error);
  }

  let revision = existingRevision;
  if (!revision) {
    try {
      revision = await saveGit({
        instanceId: input.creatorSlug,
        gameId: input.gameId,
        files: prototypeFiles,
      });
    } catch (error) {
      throw pipelineError({
        code: "SDK_PROTOTYPE_GIT_WRITE_FAILED",
        message: "prototype Git revision could not be saved.",
        layer: "store",
        operation: "mock-revision-git-save",
      }, error);
    }
  }

  if (!revision) {
    throw pipelineError({
      code: "SDK_PROTOTYPE_GIT_WRITE_FAILED",
      message: "prototype Git revision was not returned.",
      layer: "store",
      operation: "mock-revision-git-save",
    });
  }

  if (!existingRevision) {
    try {
      const manifestJson = JSON.stringify(manifest);
      const savedRows = await database`
        UPDATE sdk_games
        SET title = ${input.title}, description = ${input.description},
            manifest = ${manifestJson}::jsonb, mock_revision = ${revision},
            prototype_module_profile_revision = ${input.contract.moduleProfileRevision},
            prototype_module_contract_digest = ${input.contract.moduleContractDigest},
            prototype_sdk_package_version = ${input.contract.sdkPackage.version},
            prototype_source_sha256 = ${sourceSha256},
            mock_approved_revision = NULL, mock_approved_at = NULL,
            mock_approved_by_player_id = NULL, updated_at = NOW()
        WHERE creator_id = ${input.creatorId}
          AND game_id = ${input.gameId}
          AND module_profile_revision = ${input.contract.moduleProfileRevision}
          AND module_contract_digest = ${input.contract.moduleContractDigest}
          AND module_profile_confirmed_at IS NOT NULL
          AND deleted_at IS NULL
        RETURNING id
      `;
      if (!Array.isArray(savedRows) || savedRows.length === 0) {
        throw pipelineError({
          code: "MODULE_PROFILE_STALE",
          message: "confirmed module profile is stale.",
          layer: "validation",
          operation: "mock-revision-update",
          revision,
        });
      }
    } catch (error) {
      if (error instanceof PublishMockPipelineError) throw error;
      throw pipelineError({
        code: "SDK_PROTOTYPE_DB_UPDATE_FAILED",
        message: "prototype Git revision was saved but database update failed.",
        layer: "store",
        operation: "mock-revision-update",
        revision,
      }, error);
    }
  }

  return {
    saved: true,
    gameId: input.gameId,
    prototypeRevision: revision,
    mockRevision: revision,
    qualityEvidence: manifest.reviewEvidence,
    moduleBinding: input.usageAudit.binding,
    moduleUsage: input.usageAudit.moduleUsage,
    sharedSourceSha256: sourceSha256,
  };
}
