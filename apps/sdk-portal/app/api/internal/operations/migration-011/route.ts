import { processSdkMigration011OperatorRequest } from "@/lib/sdk-migration-011-operator-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return processSdkMigration011OperatorRequest(request);
}
