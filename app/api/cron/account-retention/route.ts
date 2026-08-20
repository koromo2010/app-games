import { NextResponse } from "next/server";
import { deleteExpiredUnverifiedPlayerAccounts } from "@/lib/player-account-store";
import { createRequestTelemetry } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/cron/account-retention", {
    operation: "account-retention",
  });
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    telemetry.reject("account.retention", 401);
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const result = await deleteExpiredUnverifiedPlayerAccounts();
    telemetry.success("account.retention.cleanup", {
      affectedCount: result.postgresDeleted + result.redisDeleted,
    });
    const protectedMissingActivity = result.postgresProtectedMissingActivity
      + result.redisProtectedMissingActivity;
    if (protectedMissingActivity > 0) {
      telemetry.info("account.retention.protected-missing-activity", {
        affectedCount: protectedMissingActivity,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    telemetry.failure("account.retention", error);
    return NextResponse.json({ error: "ACCOUNT_RETENTION_FAILED" }, { status: 503 });
  }
}
