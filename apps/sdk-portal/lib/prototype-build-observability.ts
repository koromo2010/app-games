import type {
  PrototypeBuildError,
  PrototypeBuildInputFingerprint,
} from "./prototype-builder-diagnostics.ts";

function safeGitIdentity(value: string | undefined) {
  return value && /^[a-f0-9]{40}$/.test(value) ? value : "NOT_OBSERVED";
}

export function recordPrototypeBuildFailure(input: {
  correlationId: string;
  error: PrototypeBuildError;
  builderIdentity: string;
  inputFingerprint: PrototypeBuildInputFingerprint;
}) {
  console.error(JSON.stringify({
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    level: "error",
    event: "sdk.prototype-build",
    service: "game-fields-sdk-portal",
    environment: process.env.VERCEL_ENV ?? "local",
    fields: {
      outcome: "failed",
      correlationId: input.correlationId,
      operation: "prototype-build",
      buildStage: input.error.stage,
      buildFailureCode: input.error.code,
      dependencyClass: input.error.dependencyClass,
      retryable: false,
      builderIdentity: input.builderIdentity,
      sourceCommit: safeGitIdentity(process.env.VERCEL_GIT_COMMIT_SHA),
      sourceTree: safeGitIdentity(process.env.GAME_FIELDS_SOURCE_TREE_SHA),
      inputFingerprint: input.inputFingerprint,
      fileCount: input.inputFingerprint.fileCount,
      sourceFileCount: input.inputFingerprint.sourceFileCount,
      totalUtf8BytesBucket: input.inputFingerprint.totalUtf8BytesBucket,
    },
  }));
}
