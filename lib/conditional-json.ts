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

function hashedEtag(namespace: string, value: string) {
  const digest = createHash("sha256").update(value).digest("base64url").slice(0, 24);
  return `"${namespace}-${digest}"`;
}

/** Returns 304 when the authenticated JSON view is byte-for-byte unchanged. */
export function conditionalJsonResponse(request: Request, value: unknown) {
  const body = JSON.stringify(value);
  const etag = hashedEtag("json", body);
  const headers = responseHeaders(etag);

  if (requestHasEtag(request, etag)) return new Response(null, { status: 304, headers });
  return new Response(body, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Uses a trusted version seed so an unchanged request can skip JSON projection and serialization. */
export function conditionalVersionedJsonResponse(request: Request, versionSeed: string, createValue: () => unknown) {
  const etag = hashedEtag("version", versionSeed);
  const headers = responseHeaders(etag);
  if (requestHasEtag(request, etag)) return new Response(null, { status: 304, headers });
  return new Response(JSON.stringify(createValue()), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
