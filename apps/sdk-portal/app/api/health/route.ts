import {
  ensureSdkSchema,
  SDK_SCHEMA_VERSION,
} from "@/lib/sdk-postgres";
import { probeSdkInstanceRegistry } from "@/lib/instance-registry-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSdkSchema();
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

  try {
    const instanceRegistry = await probeSdkInstanceRegistry();
    return Response.json(
      {
        service: "game-fields-sdk-portal",
        status: "ok",
        schemaVersion: SDK_SCHEMA_VERSION,
        instanceRegistry,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const notConfigured = error instanceof Error
      && error.message.includes("SDK_INSTANCE_REGISTRY_NOT_CONFIGURED");
    return Response.json(
      {
        service: "game-fields-sdk-portal",
        status: "unavailable",
        code: notConfigured
          ? "SDK_INSTANCE_REGISTRY_NOT_CONFIGURED"
          : "SDK_INSTANCE_REGISTRY_UNAVAILABLE",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
