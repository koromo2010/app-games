import type { RuntimeArtifactReader } from "@game-fields/sdk-runtime-artifact";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { SdkDatabaseBinding } from "./sdk-database-binding-diagnostic.ts";
import {
  acceptsOriginalDataPreservationRequest,
  buildOriginalDataPreservationArchive,
  encodeOriginalDataPreservationReceipt,
  OriginalDataPreservationError,
  originalDataPreservationInternalPath,
  originalDataPreservationReceiptHeader,
  type OriginalDataPreservationArchive,
  type OriginalDataPreservationArchiveInvalidStage,
  type OriginalDataPreservationCode,
} from "./original-data-preservation.ts";
import {
  readOriginalDataPreservationSnapshot,
  type OriginalDataPreservationStoreInput,
} from "./original-data-preservation-store.ts";

type RuntimeIdentity = {
  environment: "production" | "development";
  sourceRef: string;
  sourceMainCommit: string;
  sourceDeploymentIdentity: string;
};

export type OriginalDataPreservationRouteDependencies = {
  authorize(request: Request): void;
  runtimeIdentity(): RuntimeIdentity;
  databaseContext(): {
    sql: NeonQueryFunction<boolean, boolean>;
    binding: SdkDatabaseBinding;
  };
  serviceSecret(): string;
  artifactReader(): Pick<RuntimeArtifactReader, "readCommit" | "readTree" | "readBlob">;
  readSnapshot?(input: OriginalDataPreservationStoreInput): ReturnType<typeof readOriginalDataPreservationSnapshot>;
  buildArchive?(input: Parameters<typeof buildOriginalDataPreservationArchive>[0]): Promise<OriginalDataPreservationArchive>;
  log?(event: Record<string, unknown>): void;
};

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function stopped(
  code: OriginalDataPreservationCode,
  status: number,
  archiveInvalidStage?: OriginalDataPreservationArchiveInvalidStage,
) {
  return Response.json({
    schemaVersion: 1,
    phaseId: "T-131-A0",
    status: "STOPPED",
    code,
    ...(code === "A0_ARCHIVE_INVALID" && archiveInvalidStage
      ? { archiveInvalidStage }
      : {}),
    secretFree: true,
  }, { status, headers: responseHeaders });
}

function statusFor(code: OriginalDataPreservationCode) {
  if (code === "A0_INPUT_INVALID") return 400;
  if (code === "A0_AUTH_REQUIRED" || code === "A0_RECENT_MFA_REQUIRED") return 403;
  if (code === "A0_ENVIRONMENT_INVALID" || code === "A0_SOURCE_IDENTITY_INVALID") return 409;
  if (
    code === "A0_SCHEMA_PRECONDITION_FAILED"
    || code === "A0_TARGET_SNAPSHOT_INCONSISTENT"
    || code === "A0_ARTIFACT_INCOMPLETE"
    || code === "A0_ARCHIVE_INVALID"
  ) return 409;
  if (code === "A0_EXPORT_TOO_LARGE") return 413;
  return 503;
}

function safeLog(
  dependencies: OriginalDataPreservationRouteDependencies,
  outcome: "ready" | "stopped",
  code: string,
) {
  const event = {
    schemaVersion: 1,
    event: "sdk.original-data-preservation",
    phaseId: "T-131-A0",
    outcome,
    code,
    secretFree: true,
  };
  (dependencies.log ?? ((value) => console.info(JSON.stringify(value))))(event);
}

/**
 * The archive is fully assembled, hashed, and internally verified before this
 * stream is constructed. Streaming only transports already-fixed bytes and
 * avoids Vercel's non-streaming Function payload ceiling.
 */
export function verifiedBufferStream(value: Uint8Array, chunkBytes = 64 * 1024) {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= value.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(value.byteLength, offset + chunkBytes);
      controller.enqueue(value.slice(offset, end));
      offset = end;
    },
  });
}

export async function processOriginalDataPreservationRequest(
  request: Request,
  dependencies: OriginalDataPreservationRouteDependencies,
) {
  try {
    dependencies.authorize(request);
  } catch {
    safeLog(dependencies, "stopped", "A0_AUTH_REQUIRED");
    return stopped("A0_AUTH_REQUIRED", 403);
  }
  if (
    !acceptsOriginalDataPreservationRequest(
      request,
      originalDataPreservationInternalPath,
      "POST",
    )
    || (await request.text()).length !== 0
  ) {
    safeLog(dependencies, "stopped", "A0_INPUT_INVALID");
    return stopped("A0_INPUT_INVALID", 400);
  }
  const runtime = dependencies.runtimeIdentity();
  if (runtime.environment !== "production" || runtime.sourceRef !== "main") {
    safeLog(dependencies, "stopped", "A0_ENVIRONMENT_INVALID");
    return stopped("A0_ENVIRONMENT_INVALID", 409);
  }
  if (!/^[0-9a-f]{40}$/.test(runtime.sourceMainCommit) || !runtime.sourceDeploymentIdentity) {
    safeLog(dependencies, "stopped", "A0_SOURCE_IDENTITY_INVALID");
    return stopped("A0_SOURCE_IDENTITY_INVALID", 409);
  }
  let archiveInvalidStage: OriginalDataPreservationArchiveInvalidStage =
    "INTERNAL_ARCHIVE_STRUCTURE_VERIFY";
  try {
    const database = dependencies.databaseContext();
    const snapshot = await (dependencies.readSnapshot ?? readOriginalDataPreservationSnapshot)({
      ...database,
      secret: dependencies.serviceSecret(),
      sourceMainCommit: runtime.sourceMainCommit,
      sourceDeploymentIdentity: runtime.sourceDeploymentIdentity,
    });
    const result = await (dependencies.buildArchive ?? buildOriginalDataPreservationArchive)({
      snapshot,
      reader: dependencies.artifactReader(),
    });
    archiveInvalidStage = "INTERNAL_RECEIPT_ENCODE";
    const receipt = encodeOriginalDataPreservationReceipt(result.receipt);
    safeLog(dependencies, "ready", "A0_ARCHIVE_READY");
    return new Response(verifiedBufferStream(result.archive), {
      headers: {
        ...responseHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${result.receipt.filename}"`,
        "Content-Length": String(result.archive.byteLength),
        [originalDataPreservationReceiptHeader]: receipt,
      },
    });
  } catch (error) {
    const code = error instanceof OriginalDataPreservationError
      ? error.code
      : "A0_EXPORT_UNAVAILABLE";
    safeLog(dependencies, "stopped", code);
    return stopped(
      code,
      statusFor(code),
      code === "A0_ARCHIVE_INVALID" ? archiveInvalidStage : undefined,
    );
  }
}
