import assert from "node:assert/strict";
import test from "node:test";
import { normalizePreviewAssetPath, previewContentType } from "../apps/sdk-preview/lib/preview-source.ts";
import { previewContentSecurityPolicy, previewCookiePath } from "../apps/sdk-preview/lib/preview-security.ts";
import { GAME_FIELDS_PRESET_ASSET, gameFieldsPresetRuntimeSource, injectGameFieldsPreset } from "../apps/sdk-preview/lib/preset-runtime.ts";

test("SDK preview source keeps every asset inside its mock directory", () => {
  assert.equal(normalizePreviewAssetPath([]), "index.html");
  assert.equal(normalizePreviewAssetPath(["images", "table.webp"]), "images/table.webp");
  assert.equal(normalizePreviewAssetPath(["..", "secret.txt"]), null);
  assert.equal(normalizePreviewAssetPath(["folder\\secret.js"]), null);
});

test("SDK preview injects one platform preset runtime into mock HTML", () => {
  const html = injectGameFieldsPreset("<!doctype html><html><head><title>Game</title></head><body></body></html>");
  assert.match(html, new RegExp(`<script src="${GAME_FIELDS_PRESET_ASSET}" data-game-fields-preset></script></head>`));
  assert.equal(injectGameFieldsPreset(html), html);
  const source = gameFieldsPresetRuntimeSource();
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /window\.GameFieldsPreset/);
  assert.match(source, /dummy:add/);
  assert.match(source, /game:abort/);
  assert.match(source, /viewer:set/);
});

test("SDK preview source returns strict content types", () => {
  assert.equal(previewContentType("mock.js"), "text/javascript; charset=utf-8");
  assert.equal(previewContentType("image.svg"), "image/svg+xml");
  assert.equal(previewContentType("unknown.bin"), "application/octet-stream");
});

test("SDK preview content stays sandboxed and scopes its session cookie to one revision", () => {
  const policy = previewContentSecurityPolicy();
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /form-action 'none'/);
  assert.match(policy, /sandbox allow-scripts/);
  assert.doesNotMatch(policy, /allow-same-origin/);
  assert.match(policy, /frame-ancestors https:\/\/sdk-dev\.game-fields\.com https:\/\/dev\.game-fields\.com/);
  assert.equal(previewCookiePath({
    instanceId: "creator-lab",
    gameId: "sample-game",
    revision: "a".repeat(40),
  }), `/p/creator-lab/sample-game/${"a".repeat(40)}/`);
});
