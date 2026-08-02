import assert from "node:assert/strict";
import test from "node:test";
import {
  rewritePreviewJavaScriptAssetUrls,
} from "../apps/sdk-preview/lib/preview-asset-rewriter.ts";

function signed(assetPath: string) {
  return `https://preview.example/package/creator/game/revision/a/token/${assetPath}`;
}

test("runtime JavaScript asset strings receive path-scoped signed URLs", () => {
  const source = [
    'const flower = "../assets/p1-flower.svg";',
    "const skull = '../shared/p1-skull.svg';",
    'image.src = "/assets/p2-flower.png";',
  ].join("\n");

  const rewritten = rewritePreviewJavaScriptAssetUrls(
    source,
    "client/mock.js",
    signed,
  );

  assert.match(rewritten, /token\/assets\/p1-flower\.svg/);
  assert.match(rewritten, /token\/shared\/p1-skull\.svg/);
  assert.match(rewritten, /token\/assets\/p2-flower\.png/);
  assert.doesNotMatch(rewritten, /["']\.\.?(?:\/)/);
});

test("runtime rewriting covers JSON and media assets and removes query strings", () => {
  const rewritten = rewritePreviewJavaScriptAssetUrls(
    [
      'fetch("../assets/catalog.json?cache=1#catalog");',
      'const image = new URL("../assets/icon.png?cache=2#front", import.meta.url);',
      'const movie = "../media/intro.mp4?cache=3";',
      'const stream = "../media/intro.webm";',
    ].join("\n"),
    "client/main.js",
    signed,
  );

  assert.match(rewritten, /token\/assets\/catalog\.json#catalog/);
  assert.match(rewritten, /token\/assets\/icon\.png#front/);
  assert.match(rewritten, /token\/media\/intro\.mp4/);
  assert.match(rewritten, /token\/media\/intro\.webm/);
  assert.doesNotMatch(rewritten, /token\/[^"']*\?/);
});

test("runtime and package path contracts reject traversal beyond the package root", () => {
  assert.throws(
    () => rewritePreviewJavaScriptAssetUrls(
      'fetch("../../assets/icon.png");',
      "client/main.js",
      signed,
    ),
    /PREVIEW_ASSET_REFERENCE_INVALID/,
  );
});

test("runtime JavaScript rewriting leaves non-assets and remote URLs unchanged", () => {
  const source = [
    'const label = "./round-one";',
    'const remote = "https://cdn.example/icon.svg";',
    'const data = "data:image/svg+xml;base64,AAAA";',
  ].join("\n");

  assert.equal(
    rewritePreviewJavaScriptAssetUrls(source, "mock.js", signed),
    source,
  );
});

test("runtime JavaScript imports remain individually signed", () => {
  const rewritten = rewritePreviewJavaScriptAssetUrls(
    'import icon from "./assets/icon.svg";\nimport("./chunks/view.js");',
    "scripts/main.js",
    signed,
  );

  assert.match(rewritten, /token\/scripts\/assets\/icon\.svg/);
  assert.match(rewritten, /token\/scripts\/chunks\/view\.js/);
});
