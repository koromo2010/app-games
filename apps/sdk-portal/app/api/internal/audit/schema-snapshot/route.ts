import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { loadSdkSchemaAuditSnapshot } from "@/lib/sdk-schema-audit-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    requireSdkServiceRequest(request);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  if ([...new URL(request.url).searchParams.keys()].length !== 0) {
    return Response.json({ error: "SDK_AUDIT_QUERY_INVALID" }, { status: 400, headers });
  }
  try {
    const environment = process.env.VERCEL_GIT_COMMIT_REF === "main"
      ? "production"
      : "development";
    return Response.json(await loadSdkSchemaAuditSnapshot(environment), { headers });
  } catch (error) {
    const mismatch = error instanceof Error && error.message.startsWith("SDK_SCHEMA_AUDIT_VERSION_MISMATCH:");
    return Response.json({ error: mismatch ? "SDK_SCHEMA_AUDIT_VERSION_MISMATCH" : "SDK_SCHEMA_AUDIT_UNAVAILABLE" }, {
      status: mismatch ? 409 : 503,
      headers,
    });
  }
}
