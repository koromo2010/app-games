import { createGamePackageRuntimeReader } from "@/lib/mock-git-store";
import {
  CreatorRecoveryError,
  creatorQuarantineRecoveryTarget,
  creatorRecoveryErrorStatus,
  processCreatorRecoveryRequest,
} from "@/lib/creator-quarantine-recovery";
import {
  quarantineCreatorRecovery,
  readCreatorRecoveryPlan,
} from "@/lib/creator-quarantine-recovery-store";
import { ensureSdkSchema } from "@/lib/sdk-postgres";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

function environment(): "production" | "development" {
  return process.env.VERCEL_GIT_COMMIT_REF === "main" ? "production" : "development";
}

function authorize(request: Request) {
  try {
    requireSdkServiceRequest(request, { expectedEnvironment: environment() });
    return null;
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
}

async function execute(value: unknown) {
  try {
    await ensureSdkSchema();
    const targetEnvironment = environment();
    const reader = createGamePackageRuntimeReader();
    return Response.json(await processCreatorRecoveryRequest(value, {
      readPlan: () => readCreatorRecoveryPlan(targetEnvironment, reader),
      quarantine: (input) => quarantineCreatorRecovery({
        ...input,
        environment: targetEnvironment,
      }),
    }), { headers });
  } catch (error) {
    const status = creatorRecoveryErrorStatus(error);
    return Response.json({
      error: error instanceof CreatorRecoveryError
        ? error.code
        : "CREATOR_RECOVERY_UNAVAILABLE",
      diagnostic: error instanceof CreatorRecoveryError
        ? error.diagnostic
        : { phase: "request-processing", store: "sdk-portal" },
    }, { status, headers });
  }
}

export async function GET(request: Request) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  if (
    keys.length !== 1
    || keys[0] !== "slug"
    || url.searchParams.get("slug") !== creatorQuarantineRecoveryTarget
  ) {
    return Response.json(
      {
        error: "CREATOR_RECOVERY_INPUT_INVALID",
        diagnostic: { phase: "request-validation", store: "request" },
      },
      { status: 400, headers },
    );
  }
  return execute({ slug: creatorQuarantineRecoveryTarget });
}

export async function POST(request: Request) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return Response.json(
      {
        error: "CREATOR_RECOVERY_INPUT_INVALID",
        diagnostic: { phase: "request-validation", store: "request" },
      },
      { status: 400, headers },
    );
  }
  const value = await request.json().catch(() => null);
  return execute(value);
}
