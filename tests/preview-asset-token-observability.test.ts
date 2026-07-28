import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeObservabilityFields } from "../lib/observability/event.ts";
import {
  previewAssetTokenRejectionCode,
  previewAssetTokenVersionHint,
} from "../apps/sdk-preview/lib/preview-asset-token-observability.ts";

test("preview token observability fields survive the allowlist", () => {
  assert.deepEqual(
    sanitizeObservabilityFields({
      game: "sdk:skull",
      revision: 19,
      tokenVersion: "v2",
      sourceKind: "package",
      assetPath: "scripts/main.js",
      outcome: "success",
      ignoredSecret: "must-not-survive",
    }),
    {
      game: "sdk:skull",
      tokenVersion: "v2",
      sourceKind: "package",
      assetPath: "scripts/main.js",
      revision: 19,
      outcome: "success",
    },
  );
});

test("preview token version hints distinguish v1, v2, and missing tokens", () => {
  assert.equal(previewAssetTokenVersionHint("v2.abc.signature"), "v2");
  assert.equal(previewAssetTokenVersionHint("payload.signature"), "v1");
  assert.equal(previewAssetTokenVersionHint(""), "unknown");
});

test("preview token rejection classification detects missing, malformed, and expired tokens", () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  assert.equal(previewAssetTokenRejectionCode("", now), "preview_asset_token_missing");
  assert.equal(previewAssetTokenRejectionCode("v2.invalid", now), "preview_asset_token_malformed");
  assert.equal(
    previewAssetTokenRejectionCode(`v2.${(now - 1).toString(36)}.signature`, now),
    "preview_asset_token_expired",
  );
});
