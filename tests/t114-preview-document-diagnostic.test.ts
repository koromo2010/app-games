import assert from "node:assert/strict";
import test from "node:test";
import {
  previewAssetReferenceFailureResponse,
} from "../apps/sdk-preview/lib/preview-document-error.ts";

test("T-114 Preview asset-reference failure is classified without exposing an asset path", async () => {
  const response = previewAssetReferenceFailureResponse(
    "INLINE_STYLE_ASSET_NOT_BROWSER_READABLE",
  );

  assert.equal(response.status, 422);
  assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(
    response.headers.get("X-Game-Fields-Preview-Error-Code"),
    "INLINE_STYLE_ASSET_NOT_BROWSER_READABLE",
  );
  const body = await response.text();
  assert.match(body, /INLINE_STYLE_ASSET_NOT_BROWSER_READABLE/);
  assert.doesNotMatch(body, /(?:index\.html|styles\.css|mock\.js|\/)/);
});
