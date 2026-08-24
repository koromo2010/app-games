import { createHash } from "node:crypto";
import {
  isOriginalDataPreservationInternalArchiveInvalidStage,
  parseOriginalDataPreservationArchiveInvalidStage,
  type OriginalDataPreservationArchiveInvalidStage,
} from "./original-data-preservation-stage.ts";

export const originalDataPreservationAdminPath =
  "/api/admin/sdk-original-data-preservation";
export const originalDataPreservationInternalPath =
  "/api/internal/operations/original-data-preservation";
export const originalDataPreservationReceiptHeader =
  "X-Game-Fields-A0-Preservation-Receipt";

type TargetReceipt = {
  target: "moi-lab2" | "yabobojpn-lab";
  lifecycle: "active" | "deleted";
  principalValidity: "BOUND" | "NULL";
  recordCounts: Record<string, number>;
  artifactStatus: "COMPLETE" | "ARTIFACT_SOURCE_NOT_LOCATED";
  artifactLocatorCount: number;
  artifactPresentCount: number;
  artifactMissingCount: 0;
  artifactUnavailableCount: 0;
  artifactFileCount: number;
};

export type OriginalDataPreservationSafeReceipt = {
  schemaVersion: 1;
  phaseId: "T-131-A0";
  sourceMainCommit: string;
  sourceDeploymentFingerprint: string;
  semanticEnvironment: "production";
  sourceDatabaseFingerprint: string;
  snapshotFingerprint: string;
  observedAt: string;
  observedSchemaVersion: 9;
  migrationLedger: "CANONICAL_001_009_AND_010_ABSENT";
  targets: [TargetReceipt, TargetReceipt];
  filename: string;
  zipBytes: number;
  zipSha256: string;
  serverArchiveVerification: "PASS";
  credentialScan: "PASS";
  productionWriteCount: 0;
  controlPlaneWriteCount: 0;
};

export type OriginalDataPreservationProxyDependencies = {
  requireRecentMfa(): Promise<unknown>;
  authorizationError(error: unknown): Response | null;
  runtimeIdentity(): {
    environment: "production" | "development";
    sourceRef: string;
    sourceMainCommit: string;
  };
  targetUrl(): string;
  serviceHeaders(url: string): Record<string, string>;
  fetchTarget: typeof fetch;
};

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const overrideHeaders = [
  "creator-slug",
  "slug",
  "target",
  "target-slug",
  "filename",
  "revision",
  "source-ref",
  "x-creator-slug",
  "x-creator-target",
  "x-target-slug",
  "x-database-url",
  "x-database",
  "x-environment",
  "x-filename",
  "x-migration",
  "x-revision",
  "x-source-ref",
  "x-sql",
  "x-table",
] as const;
const sha1Pattern = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const maximumZipBytes = 300 * 1024 * 1024;
const allowedStopCodes = new Set([
  "A0_AUTH_REQUIRED",
  "A0_RECENT_MFA_REQUIRED",
  "A0_INPUT_INVALID",
  "A0_ENVIRONMENT_INVALID",
  "A0_SOURCE_IDENTITY_INVALID",
  "A0_SCHEMA_PRECONDITION_FAILED",
  "A0_TARGET_SNAPSHOT_INCONSISTENT",
  "A0_ARTIFACT_INCOMPLETE",
  "A0_EXPORT_TOO_LARGE",
  "A0_ARCHIVE_INVALID",
  "A0_EXPORT_UNAVAILABLE",
]);

function stopped(
  code: string,
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

function acceptsRequest(request: Request) {
  const url = new URL(request.url);
  const contentLength = request.headers.get("content-length");
  return request.method === "POST"
    && url.pathname === originalDataPreservationAdminPath
    && url.search === ""
    && (contentLength === null || contentLength === "0")
    && overrideHeaders.every((name) => !request.headers.has(name));
}

function targetReceiptShape(value: unknown, expectedTarget: string): value is TargetReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<TargetReceipt>;
  return receipt.target === expectedTarget
    && (receipt.lifecycle === "active" || receipt.lifecycle === "deleted")
    && (receipt.principalValidity === "BOUND" || receipt.principalValidity === "NULL")
    && receipt.recordCounts !== null
    && typeof receipt.recordCounts === "object"
    && Object.values(receipt.recordCounts).every((count) => Number.isSafeInteger(count) && count >= 0)
    && (receipt.artifactStatus === "COMPLETE" || receipt.artifactStatus === "ARTIFACT_SOURCE_NOT_LOCATED")
    && Number.isSafeInteger(receipt.artifactLocatorCount)
    && Number.isSafeInteger(receipt.artifactPresentCount)
    && receipt.artifactMissingCount === 0
    && receipt.artifactUnavailableCount === 0
    && Number.isSafeInteger(receipt.artifactFileCount);
}

function decodeReceipt(value: string): OriginalDataPreservationSafeReceipt | null {
  if (!value || value.length > 16_384) return null;
  try {
    const receipt = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<OriginalDataPreservationSafeReceipt>;
    return receipt.schemaVersion === 1
      && receipt.phaseId === "T-131-A0"
      && typeof receipt.sourceMainCommit === "string"
      && sha1Pattern.test(receipt.sourceMainCommit)
      && typeof receipt.sourceDeploymentFingerprint === "string"
      && sha256Pattern.test(receipt.sourceDeploymentFingerprint)
      && receipt.semanticEnvironment === "production"
      && typeof receipt.sourceDatabaseFingerprint === "string"
      && sha256Pattern.test(receipt.sourceDatabaseFingerprint)
      && typeof receipt.snapshotFingerprint === "string"
      && sha256Pattern.test(receipt.snapshotFingerprint)
      && typeof receipt.observedAt === "string"
      && receipt.observedSchemaVersion === 9
      && receipt.migrationLedger === "CANONICAL_001_009_AND_010_ABSENT"
      && Array.isArray(receipt.targets)
      && receipt.targets.length === 2
      && targetReceiptShape(receipt.targets[0], "moi-lab2")
      && targetReceiptShape(receipt.targets[1], "yabobojpn-lab")
      && typeof receipt.filename === "string"
      && /^Game-Fields-T-131-A0-original-data-\d{8}T\d{6}Z\.zip$/.test(receipt.filename)
      && Number.isSafeInteger(receipt.zipBytes)
      && Number(receipt.zipBytes) > 0
      && typeof receipt.zipSha256 === "string"
      && sha256Pattern.test(receipt.zipSha256)
      && receipt.serverArchiveVerification === "PASS"
      && receipt.credentialScan === "PASS"
      && receipt.productionWriteCount === 0
      && receipt.controlPlaneWriteCount === 0
      ? receipt as OriginalDataPreservationSafeReceipt
      : null;
  } catch {
    return null;
  }
}

function verifiedBufferStream(value: Uint8Array, chunkBytes = 64 * 1024) {
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

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export async function proxyOriginalDataPreservation(
  request: Request,
  dependencies: OriginalDataPreservationProxyDependencies,
) {
  if (!acceptsRequest(request) || (await request.text()).length !== 0) {
    return stopped("A0_INPUT_INVALID", 400);
  }
  try {
    await dependencies.requireRecentMfa();
  } catch (error) {
    const authorization = dependencies.authorizationError(error);
    return authorization?.status === 401
      ? stopped("A0_AUTH_REQUIRED", 401)
      : authorization?.status === 503
        ? stopped("A0_EXPORT_UNAVAILABLE", 503)
        : stopped("A0_RECENT_MFA_REQUIRED", 403);
  }
  const runtime = dependencies.runtimeIdentity();
  if (
    runtime.environment !== "production"
    || runtime.sourceRef !== "main"
    || !sha1Pattern.test(runtime.sourceMainCommit)
  ) {
    return stopped("A0_ENVIRONMENT_INVALID", 409);
  }
  let targetUrl: URL;
  try {
    targetUrl = new URL(dependencies.targetUrl());
  } catch {
    return stopped("A0_SOURCE_IDENTITY_INVALID", 409);
  }
  if (
    targetUrl.pathname !== originalDataPreservationInternalPath
    || targetUrl.search !== ""
    || targetUrl.hash !== ""
    || targetUrl.username !== ""
    || targetUrl.password !== ""
    || targetUrl.protocol !== "https:"
  ) {
    return stopped("A0_SOURCE_IDENTITY_INVALID", 409);
  }
  try {
    const url = targetUrl.toString();
    const response = await dependencies.fetchTarget(url, {
      method: "POST",
      headers: dependencies.serviceHeaders(url),
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as {
        code?: unknown;
        archiveInvalidStage?: unknown;
      } | null;
      const code = typeof payload?.code === "string" && allowedStopCodes.has(payload.code)
        ? payload.code
        : "A0_EXPORT_UNAVAILABLE";
      const upstreamStage = parseOriginalDataPreservationArchiveInvalidStage(
        payload?.archiveInvalidStage,
      );
      const archiveInvalidStage = code === "A0_ARCHIVE_INVALID"
        && isOriginalDataPreservationInternalArchiveInvalidStage(upstreamStage)
        ? upstreamStage
        : code === "A0_ARCHIVE_INVALID"
          ? "PROXY_UPSTREAM_ARCHIVE_INVALID"
          : undefined;
      return stopped(
        code,
        response.status >= 400 && response.status < 600 ? response.status : 503,
        archiveInvalidStage,
      );
    }
    const receiptValue = response.headers.get(originalDataPreservationReceiptHeader) ?? "";
    const receipt = decodeReceipt(receiptValue);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    const disposition = response.headers.get("content-disposition");
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (!receipt) {
      return stopped("A0_ARCHIVE_INVALID", 502, "PROXY_RECEIPT_DECODE_OR_SHAPE");
    }
    if (receipt.sourceMainCommit !== runtime.sourceMainCommit) {
      return stopped("A0_ARCHIVE_INVALID", 502, "PROXY_SOURCE_COMMIT");
    }
    if (contentType !== "application/zip") {
      return stopped("A0_ARCHIVE_INVALID", 502, "PROXY_CONTENT_TYPE");
    }
    if (disposition !== `attachment; filename="${receipt.filename}"`) {
      return stopped("A0_ARCHIVE_INVALID", 502, "PROXY_CONTENT_DISPOSITION");
    }
    if (declaredLength !== receipt.zipBytes || declaredLength > maximumZipBytes) {
      return stopped("A0_ARCHIVE_INVALID", 502, "PROXY_DECLARED_LENGTH_OR_CEILING");
    }
    const archive = new Uint8Array(await response.arrayBuffer());
    if (archive.byteLength !== receipt.zipBytes) {
      return stopped("A0_ARCHIVE_INVALID", 502, "PROXY_RECEIVED_LENGTH");
    }
    if (sha256(archive) !== receipt.zipSha256) {
      return stopped("A0_ARCHIVE_INVALID", 502, "PROXY_RECEIVED_SHA256");
    }
    return new Response(verifiedBufferStream(archive), {
      headers: {
        ...responseHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": disposition,
        "Content-Length": String(archive.byteLength),
        [originalDataPreservationReceiptHeader]: receiptValue,
      },
    });
  } catch {
    return stopped("A0_EXPORT_UNAVAILABLE", 503);
  }
}
