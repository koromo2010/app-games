import { proxySdkMigration011Diagnostic } from "@/lib/sdk-migration-011-diagnostic-proxy";
import { sdkMigration011DiagnosticServerDependencies } from "@/lib/sdk-migration-011-diagnostic-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxySdkMigration011Diagnostic(
    request,
    sdkMigration011DiagnosticServerDependencies(),
  );
}
