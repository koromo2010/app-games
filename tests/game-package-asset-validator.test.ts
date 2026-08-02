import assert from "node:assert/strict";
import test from "node:test";
import { auditPreparedGamePackageAssets } from "../apps/sdk-portal/lib/game-package-asset-audit.ts";
import { sdkPackageAssetFixture } from "./sdk-package-asset-fixtures.ts";

function codes(files: ReturnType<typeof sdkPackageAssetFixture>) {
  return auditPreparedGamePackageAssets(files).findings.map((finding) => finding.code);
}

test("HTML, CSS, JS and TS static references are accepted deterministically", () => {
  const files = sdkPackageAssetFixture({
    "client/main.js": "import './module.js'; import('./lazy.js'); const icon='../assets/icon.png'; new URL(icon, import.meta.url);",
    "client/lazy.js": "export default true;",
  });
  assert.deepEqual(auditPreparedGamePackageAssets(files), { valid: true, findings: [] });
  assert.deepEqual(auditPreparedGamePackageAssets([...files].reverse()), { valid: true, findings: [] });
});

test("missing asset and exact path casing are distinguished", () => {
  assert.ok(codes(sdkPackageAssetFixture({ "index.html": "<!doctype html><img src='./assets/missing.png'>" })).includes("GAME_SDK_PACKAGE_ASSET_MISSING"));
  assert.ok(codes(sdkPackageAssetFixture({ "index.html": "<!doctype html><img src='./Assets/icon.png'>" })).includes("GAME_SDK_PACKAGE_ASSET_CASE_MISMATCH"));
});

test("package root escapes and browser-private files are rejected", () => {
  assert.ok(codes(sdkPackageAssetFixture({ "index.html": "<!doctype html><img src='../secret.png'>" })).includes("GAME_SDK_PACKAGE_ASSET_OUTSIDE_ROOT"));
  assert.ok(codes(sdkPackageAssetFixture({ "index.html": "<!doctype html><script src='./source/app-set.ts'></script>" })).includes("GAME_SDK_PACKAGE_ASSET_NOT_BROWSER_READABLE"));
});

test("dynamic templates, concatenation and unresolved variables fail closed", () => {
  for (const source of [
    "new URL(`../assets/${theme}.png`, import.meta.url);",
    "new URL('../assets/' + theme + '.png', import.meta.url);",
    "new URL(assetPath, import.meta.url);",
  ]) {
    assert.ok(codes(sdkPackageAssetFixture({ "client/main.js": source })).includes("GAME_SDK_PACKAGE_ASSET_DYNAMIC_REFERENCE"));
  }
});

test("source parse errors fail closed with location and hint", () => {
  const audit = auditPreparedGamePackageAssets(sdkPackageAssetFixture({ "client/main.js": "const = ;" }));
  assert.equal(audit.valid, false);
  assert.equal(audit.findings[0]?.code, "GAME_SDK_PACKAGE_ASSET_PARSE_ERROR");
  assert.ok((audit.findings[0]?.line ?? 0) >= 1);
  assert.ok((audit.findings[0]?.column ?? 0) >= 1);
  assert.ok(audit.findings[0]?.hint);
});

test("srcset, CSS import and url references use the same policy", () => {
  const files = sdkPackageAssetFixture({
    "index.html": "<!doctype html><img srcset='./assets/missing.png 1x, ./assets/Icon.png 2x'>",
    "assets/styles.css": "@import './missing.css'; .x{background:url('../source/app-set.ts')}",
  });
  assert.deepEqual(new Set(codes(files)), new Set([
    "GAME_SDK_PACKAGE_ASSET_MISSING",
    "GAME_SDK_PACKAGE_ASSET_CASE_MISMATCH",
    "GAME_SDK_PACKAGE_ASSET_NOT_BROWSER_READABLE",
  ]));
});

test("external, data and blob URLs are excluded", () => {
  const files = sdkPackageAssetFixture({
    "index.html": "<!doctype html><img src='https://example.test/a.png'><img src='data:image/png;base64,AA=='><script src='blob:test'></script>",
    "assets/styles.css": ".a{background:url(https://example.test/a.png)}.b{background:url(data:image/png;base64,AA==)}",
    "client/main.js": "fetch('https://example.test/a.json'); new URL('blob:test');",
  });
  assert.deepEqual(auditPreparedGamePackageAssets(files), { valid: true, findings: [] });
});

test("comments and ordinary display strings do not create false positives", () => {
  const files = sdkPackageAssetFixture({
    "client/main.js": "// '../assets/missing.png'\nconst label = '../assets/missing.png'; document.body.textContent = label;",
    "assets/styles.css": "/* url('./missing.png') */ .label::after{content:'missing.png'}",
  });
  assert.deepEqual(auditPreparedGamePackageAssets(files), { valid: true, findings: [] });
});

test("finding order is stable by file, line, column and code", () => {
  const audit = auditPreparedGamePackageAssets(sdkPackageAssetFixture({
    "index.html": "<!doctype html><img src='./z.png'><img src='./a.png'>",
    "client/main.js": "new URL(name, import.meta.url);",
  }));
  assert.deepEqual(audit.findings, [...audit.findings].sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column || left.code.localeCompare(right.code) || left.reference.localeCompare(right.reference)));
});

test("HTML href and poster references are inspected", () => {
  const audit = auditPreparedGamePackageAssets(sdkPackageAssetFixture({
    "index.html": "<!doctype html><a href='./client/main.js'>x</a><video poster='./assets/icon.png'></video>",
  }));
  assert.equal(audit.valid, true);
});

test("const variables resolve through new URL", () => {
  const audit = auditPreparedGamePackageAssets(sdkPackageAssetFixture({
    "client/main.js": "const base='../assets/'; const file='icon.png'; new URL(base + file, import.meta.url);",
  }));
  assert.equal(audit.valid, true);
});

test("static template literals resolve without dynamic findings", () => {
  const audit = auditPreparedGamePackageAssets(sdkPackageAssetFixture({
    "client/main.js": "const file='icon.png'; new URL(`../assets/${file}`, import.meta.url);",
  }));
  assert.equal(audit.valid, true);
});

test("dynamic import expressions fail closed", () => {
  assert.ok(codes(sdkPackageAssetFixture({
    "client/main.js": "import(`./${moduleName}.js`);",
  })).includes("GAME_SDK_PACKAGE_ASSET_DYNAMIC_REFERENCE"));
});

test("fetch package references are checked", () => {
  assert.ok(codes(sdkPackageAssetFixture({
    "client/main.js": "fetch('../assets/missing.json');",
  })).includes("GAME_SDK_PACKAGE_ASSET_MISSING"));
});

test("percent-encoded package references normalize before lookup", () => {
  const audit = auditPreparedGamePackageAssets(sdkPackageAssetFixture({
    "index.html": "<!doctype html><script src='./assets/client%40t76.js'></script>",
    "assets/client@t76.js": "export default true;",
  }));
  assert.equal(audit.valid, true);
});

test("query and fragment suffixes use the same package path for lookup", () => {
  const audit = auditPreparedGamePackageAssets(sdkPackageAssetFixture({
    "index.html": "<!doctype html><img src='./assets/icon.png?cache=1#front'>",
  }));
  assert.deepEqual(audit, { valid: true, findings: [] });
});

test("every finding exposes the structured contract", () => {
  const finding = auditPreparedGamePackageAssets(sdkPackageAssetFixture({
    "index.html": "<!doctype html><img src='./missing.png'>",
  })).findings[0];
  assert.deepEqual(Object.keys(finding ?? {}).sort(), ["code", "column", "file", "hint", "line", "reference"].sort());
});
