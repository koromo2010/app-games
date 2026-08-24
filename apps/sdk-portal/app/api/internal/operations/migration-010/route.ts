import { processSdkMigration010OperatorRequest } from "@/lib/sdk-migration-010-operator-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return processSdkMigration010OperatorRequest(request);
}
