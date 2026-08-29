import { processSdkMigration011DiagnosticRequest } from "@/lib/sdk-migration-011-diagnostic-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return processSdkMigration011DiagnosticRequest(request);
}
