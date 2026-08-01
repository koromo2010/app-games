export type SdkAuditKind = "schema-snapshot" | "runtime-manifest";

const GAME = /^[a-z][a-z0-9-]{1,63}$/;
const REVISION = /^[a-f0-9]{40}$/;
const NO_STORE = { "Cache-Control": "private, no-store" };

function response(payload: unknown, status: number) {
  return Response.json(payload, { status, headers: NO_STORE });
}

function validatedQuery(request: Request, kind: SdkAuditKind) {
  const parameters = new URL(request.url).searchParams;
  if (kind === "schema-snapshot") return [...parameters.keys()].length === 0 ? "" : null;
  if ([...parameters.keys()].length !== 2 || parameters.getAll("gameId").length !== 1 || parameters.getAll("revision").length !== 1) return null;
  const gameId = parameters.get("gameId") ?? "";
  const revision = parameters.get("revision") ?? "";
  return GAME.test(gameId) && REVISION.test(revision)
    ? `?gameId=${encodeURIComponent(gameId)}&revision=${revision}`
    : null;
}

export async function proxySiteAdminSdkAuditGet(input: {
  request: Request;
  kind: SdkAuditKind;
  authorize: () => Promise<unknown>;
  portalBaseUrl: string;
  serviceHeaders: (method: string, url: string) => Record<string, string>;
  fetchRuntime: typeof fetch;
}) {
  try {
    await input.authorize();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SITE_ADMIN_AUTH_REQUIRED") return response({ error: "ADMIN_AUTH_REQUIRED" }, 401);
    if (message === "SITE_ADMIN_FULL_AUTH_REQUIRED") return response({ error: "ADMIN_FULL_AUTH_REQUIRED" }, 403);
    if (message === "SITE_ADMIN_PASSWORD_NOT_CONFIGURED") return response({ error: "SITE_ADMIN_PASSWORD_NOT_CONFIGURED" }, 503);
    return response({ error: "SDK_AUDIT_AUTH_UNAVAILABLE" }, 503);
  }
  const query = validatedQuery(input.request, input.kind);
  if (query === null) return response({ error: "SDK_AUDIT_QUERY_INVALID" }, 400);
  try {
    const base = input.portalBaseUrl.replace(/\/$/, "");
    const url = `${base}/api/internal/audit/${input.kind}${query}`;
    const upstream = await input.fetchRuntime(url, {
      method: "GET",
      headers: input.serviceHeaders("GET", url),
      cache: "no-store",
    });
    const payload = await upstream.json().catch(() => ({ error: "SDK_AUDIT_RESPONSE_INVALID" }));
    return response(payload, upstream.status);
  } catch {
    return response({ error: "SDK_AUDIT_UNAVAILABLE" }, 503);
  }
}
