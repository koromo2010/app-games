import {
  ensureSdkSchema,
  SDK_SCHEMA_VERSION,
} from "@/lib/sdk-postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSdkSchema();
    return Response.json(
      {
        service: "game-fields-sdk-portal",
        status: "ok",
        schemaVersion: SDK_SCHEMA_VERSION,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const migrationRequired = error instanceof Error
      && error.message.includes("SDK_SCHEMA_MIGRATION_REQUIRED");
    return Response.json(
      {
        service: "game-fields-sdk-portal",
        status: "unavailable",
        code: migrationRequired
          ? "SDK_SCHEMA_MIGRATION_REQUIRED"
          : "SDK_DATABASE_UNAVAILABLE",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
