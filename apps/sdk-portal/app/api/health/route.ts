import {
  ensureSdkSchema,
  SDK_SCHEMA_VERSION,
} from "@/lib/sdk-postgres";
import { createPreviewSigningProbe } from "@/lib/preview-links";

export const dynamic = "force-dynamic";

async function checkPreviewSigning() {
  const probe = createPreviewSigningProbe();
  const response = await fetch(probe.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${probe.token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("SDK_PREVIEW_SIGNING_MISMATCH");
}

export async function GET() {
  const [database, previewSigning] = await Promise.allSettled([
    ensureSdkSchema(),
    checkPreviewSigning(),
  ]);
  if (database.status === "fulfilled" && previewSigning.status === "fulfilled") {
    return Response.json(
      {
        service: "game-fields-sdk-portal",
        status: "ok",
        schemaVersion: SDK_SCHEMA_VERSION,
        previewSigning: "ok",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const migrationRequired = database.status === "rejected"
    && database.reason instanceof Error
    && database.reason.message.includes("SDK_SCHEMA_MIGRATION_REQUIRED");
  const code = database.status === "rejected"
    ? migrationRequired
      ? "SDK_SCHEMA_MIGRATION_REQUIRED"
      : "SDK_DATABASE_UNAVAILABLE"
    : "SDK_PREVIEW_SIGNING_MISMATCH";
  return Response.json(
    {
      service: "game-fields-sdk-portal",
      status: "unavailable",
      code,
      schemaVersion: database.status === "fulfilled"
        ? SDK_SCHEMA_VERSION
        : undefined,
      previewSigning: previewSigning.status === "fulfilled"
        ? "ok"
        : "unavailable",
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
