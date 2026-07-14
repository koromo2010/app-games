import { createHash } from "node:crypto";

function responseHeaders(etag: string) {
  return {
    "Cache-Control": "private, no-cache",
    ETag: etag,
    Vary: "Cookie",
  };
}

function requestHasEtag(request: Request, etag: string) {
  return request.headers.get("if-none-match")
    ?.split(",")
    .map((value) => value.trim())
    .includes(etag) ?? false;
}

/** Returns 304 when the authenticated JSON view is byte-for-byte unchanged. */
export function conditionalJsonResponse(request: Request, value: unknown) {
  const body = JSON.stringify(value);
  const digest = createHash("sha256").update(body).digest("base64url").slice(0, 24);
  const etag = `"json-${digest}"`;
  const headers = responseHeaders(etag);

  if (requestHasEtag(request, etag)) return new Response(null, { status: 304, headers });
  return new Response(body, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
