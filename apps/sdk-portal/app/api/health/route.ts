import {
  ensureSdkSchema,
  SDK_SCHEMA_VERSION,
  sdkSql,
} from "@/lib/sdk-postgres";
import {
  isCompleteSdkMigration011ObjectContract,
  readSdkMigration011ObjectContract,
} from "@/lib/sdk-migration-011-object-contract";
import { probeSdkInstanceRegistry } from "@/lib/instance-registry-client";
import { probePrototypeBuilderRuntime } from "@/lib/node-free-game-package";
import { PrototypeBuildError } from "@/lib/prototype-builder-diagnostics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSdkSchema();
    const objectContract = await readSdkMigration011ObjectContract(sdkSql());
    if (!isCompleteSdkMigration011ObjectContract(objectContract)) {
      throw new Error("SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH");
    }
  } catch (error) {
    const migrationRequired = error instanceof Error
      && error.message.includes("SDK_SCHEMA_MIGRATION_REQUIRED");
    const objectContractMismatch = error instanceof Error
      && error.message.includes("SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH");
    return Response.json(
      {
        service: "game-fields-sdk-portal",
        status: "unavailable",
        code: migrationRequired
          ? "SDK_SCHEMA_MIGRATION_REQUIRED"
          : objectContractMismatch
            ? "SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH"
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
    let prototypeBuilder: Awaited<ReturnType<typeof probePrototypeBuilderRuntime>>;
    try {
      prototypeBuilder = await probePrototypeBuilderRuntime();
    } catch (error) {
      const buildError = error instanceof PrototypeBuildError ? error : null;
      return Response.json(
        {
          service: "game-fields-sdk-portal",
          status: "unavailable",
          code: "SDK_PROTOTYPE_BUILDER_UNAVAILABLE",
          prototypeBuilder: "unavailable",
          ...(buildError ? {
            buildStage: buildError.stage,
            buildFailureCode: buildError.code,
          } : {}),
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    return Response.json(
      {
        service: "game-fields-sdk-portal",
        status: "ok",
        schemaVersion: SDK_SCHEMA_VERSION,
        instanceRegistry,
        prototypeBuilder: prototypeBuilder.prototypeBuilder,
        runtimeContractVersion: prototypeBuilder.runtimeContractVersion,
        builderIdentity: prototypeBuilder.builderIdentity,
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
