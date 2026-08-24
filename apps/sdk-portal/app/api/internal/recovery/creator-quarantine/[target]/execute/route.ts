import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import {
  creatorRecoveryErrorStatus,
  isCreatorRowQuarantineTarget,
  processCreatorRecoveryWrite,
} from "@/lib/creator-quarantine-recovery";
import { quarantineCreatorRecovery, readCreatorRecoveryPlan } from "@/lib/creator-quarantine-recovery-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ target: string }> }) {
  try {
    requireSdkServiceRequest(request, { expectedEnvironment: "production" });
    const { target } = await context.params;
    if (!isCreatorRowQuarantineTarget(target) || new URL(request.url).search !== "") {
      return Response.json({ error: "CREATOR_RECOVERY_INPUT_INVALID" }, { status: 400, headers });
    }
    const value = await request.json();
    const receipt = await processCreatorRecoveryWrite(value, {
      readPlan: () => readCreatorRecoveryPlan(target, "production"),
      quarantine: (input) => quarantineCreatorRecovery({ target, environment: "production", ...input }),
    });
    return Response.json(receipt, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "CREATOR_RECOVERY_UNAVAILABLE" }, {
      status: creatorRecoveryErrorStatus(error), headers,
    });
  }
}
