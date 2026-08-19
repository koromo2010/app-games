import assert from "node:assert/strict";
import test from "node:test";
import {
  previewInlineStyleAssetPaths,
  PreviewAssetReferenceError,
  rewritePreviewHtmlAssetUrls,
  rewritePreviewHtmlDocument,
} from "../apps/sdk-preview/lib/preview-asset-rewriter.ts";
import {
  PreviewCspHashGenerationError,
  previewContentSecurityPolicy,
  previewInlineStyleHash,
  previewInlineStyleHashes,
} from "../apps/sdk-preview/lib/preview-security.ts";

const ORIGIN = "https://preview.example";

function signed(assetPath: string) {
  return `${ORIGIN}/package/creator/game/revision/a/token/${assetPath}`;
}

function directive(policy: string, name: string) {
  return policy.split("; ").find((candidate) => candidate.startsWith(`${name} `));
}

function expectCode(action: () => unknown, code: PreviewAssetReferenceError["code"]) {
  assert.throws(action, (error) => (
    error instanceof PreviewAssetReferenceError && error.code === code
  ));
}

test("T-115 common Preview rewrites safe inline CSS and hashes exact response bytes", async () => {
  const packageHashClaim = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const html = `<!doctype html><html><head>
    <link rel="stylesheet" href="./styles.css">
    <style nonce="${packageHashClaim}">
      @import "./theme.css";
      .card{background:url("./images/card.png#front")}
    </style>
  </head><body><script src="./mock.js"></script></body></html>`;
  const available = new Set(["theme.css", "images/card.png"]);
  assert.deepEqual(
    previewInlineStyleAssetPaths(html, "index.html"),
    ["images/card.png", "theme.css"],
  );

  const rewritten = rewritePreviewHtmlDocument(
    html,
    "index.html",
    signed,
    available,
  );
  assert.match(rewritten.html, /token\/styles\.css/);
  assert.match(rewritten.html, /token\/mock\.js/);
  assert.match(rewritten.inlineStyleContents[0] ?? "", /token\/theme\.css/);
  assert.match(rewritten.inlineStyleContents[0] ?? "", /token\/images\/card\.png#front/);

  const hashes = previewInlineStyleHashes(rewritten.inlineStyleContents);
  assert.deepEqual(hashes, [previewInlineStyleHash(rewritten.inlineStyleContents[0] ?? "")]);
  const policy = previewContentSecurityPolicy(ORIGIN, hashes);
  assert.ok(policy.includes(`'${hashes[0]}'`));
  assert.match(policy, /style-src-attr 'none'/);
  assert.doesNotMatch(policy, /unsafe-inline/);
  assert.equal(policy.includes(packageHashClaim), false);

  const response = new Response(rewritten.html, {
    status: 200,
    headers: { "Content-Security-Policy": policy },
  });
  assert.equal(response.status, 200);
  const responseBody = await response.text();
  assert.ok(responseBody.includes(rewritten.inlineStyleContents[0] ?? ""));
});

test("T-115 repair-style external stylesheet flow keeps zero inline hashes", () => {
  const html = "<!doctype html><html><head><link rel='stylesheet' href='./styles.css'></head><body><script src='./mock.js'></script></body></html>";
  const rewritten = rewritePreviewHtmlDocument(
    html,
    "index.html",
    signed,
  );
  assert.match(rewritten.html, /token\/styles\.css/);
  assert.match(rewritten.html, /token\/mock\.js/);
  assert.deepEqual(rewritten.inlineStyleContents, []);
  assert.deepEqual(previewInlineStyleHashes(rewritten.inlineStyleContents), []);
  assert.doesNotMatch(previewContentSecurityPolicy(ORIGIN), /sha256-/);
});

test("T-115 structural HTML policy rejects executable inline surfaces", () => {
  const cases = [
    ["<!doctype html><base href='./'>", "BASE_ELEMENT_UNSUPPORTED"],
    ["<!doctype html><script>window.bad=true</script>", "INLINE_SCRIPT_UNSUPPORTED"],
    ["<!doctype html><button onclick='bad()'>x</button>", "EVENT_HANDLER_UNSUPPORTED"],
    ["<!doctype html><p style='color:red'>x</p>", "STYLE_ATTRIBUTE_UNSUPPORTED"],
    ["<!doctype html><div title=\"unterminated></div>", "HTML_PARSE_ERROR"],
  ] as const;
  for (const [html, code] of cases) {
    expectCode(
      () => previewInlineStyleAssetPaths(html, "index.html"),
      code,
    );
  }
});

test("T-115 inline CSS rejects outside, private, missing, dynamic, and malformed inputs", () => {
  expectCode(
    () => previewInlineStyleAssetPaths(
      "<!doctype html><style>.x{background:url('../outside.png')}</style>",
      "index.html",
    ),
    "INLINE_STYLE_ASSET_OUTSIDE_ROOT",
  );
  expectCode(
    () => previewInlineStyleAssetPaths(
      "<!doctype html><style>@import './source/app-set.ts';</style>",
      "index.html",
    ),
    "INLINE_STYLE_ASSET_NOT_BROWSER_READABLE",
  );
  const missing = "<!doctype html><style>.x{background:url('./missing.png')}</style>";
  assert.deepEqual(previewInlineStyleAssetPaths(missing, "index.html"), ["missing.png"]);
  expectCode(
    () => rewritePreviewHtmlDocument(missing, "index.html", signed),
    "INLINE_STYLE_ASSET_MISSING",
  );
  expectCode(
    () => previewInlineStyleAssetPaths(
      "<!doctype html><style>.x{background:url(var(--asset))}</style>",
      "index.html",
    ),
    "INLINE_STYLE_ASSET_INVALID",
  );
  expectCode(
    () => previewInlineStyleAssetPaths(
      "<!doctype html><style>.x{color:red</style>",
      "index.html",
    ),
    "INLINE_STYLE_PARSE_ERROR",
  );
});

test("T-115 comments and ordinary text are not mistaken for executable markup", () => {
  const html = "<!doctype html><p>&lt;style&gt; style= onclick=</p><!-- <style>.bad{}</style> -->";
  assert.deepEqual(previewInlineStyleAssetPaths(html, "index.html"), []);
  const rewritten = rewritePreviewHtmlDocument(html, "index.html", signed);
  assert.equal(rewritten.html, html);
  assert.deepEqual(rewritten.inlineStyleContents, []);
});

test("T-115 multiple style hashes are deduplicated and deterministic", () => {
  const first = ".a{color:red}";
  const second = ".b{color:blue}";
  const html = `<!doctype html><style>${first}</style><style>${second}</style><style>${first}</style>`;
  const rewritten = rewritePreviewHtmlDocument(html, "index.html", signed);
  const hashes = previewInlineStyleHashes(rewritten.inlineStyleContents);
  assert.equal(rewritten.inlineStyleContents.length, 3);
  assert.equal(hashes.length, 2);
  assert.deepEqual(hashes, [...hashes].sort());
  assert.deepEqual(previewInlineStyleHashes([...rewritten.inlineStyleContents].reverse()), hashes);
  const styleDirective = directive(
    previewContentSecurityPolicy(ORIGIN, [...hashes, hashes[0]!]),
    "style-src",
  ) ?? "";
  for (const hash of hashes) {
    assert.equal(styleDirective.split(hash).length - 1, 1);
  }
});

test("T-115 one-byte style tamper cannot reuse the previous CSP hash", () => {
  const original = ".a{color:red}";
  const tampered = ".a{color:Red}";
  const originalHash = previewInlineStyleHash(original);
  const tamperedHash = previewInlineStyleHash(tampered);
  assert.notEqual(originalHash, tamperedHash);
  assert.equal(
    previewContentSecurityPolicy(ORIGIN, [tamperedHash]).includes(originalHash),
    false,
  );
});

test("T-115 CSP accepts only computed hash format and preserves strict directives", () => {
  const hash = previewInlineStyleHash(".x{color:red}");
  const baseline = previewContentSecurityPolicy(ORIGIN);
  const policy = previewContentSecurityPolicy(ORIGIN, [hash]);
  for (const name of ["script-src", "frame-ancestors", "sandbox"]) {
    assert.equal(directive(policy, name), directive(baseline, name));
  }
  for (const strict of [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "connect-src 'none'",
    "worker-src 'none'",
    "child-src 'none'",
    "style-src-attr 'none'",
  ]) {
    assert.ok(policy.includes(strict));
  }
  assert.ok((directive(policy, "style-src") ?? "").includes(hash));
  assert.ok((directive(policy, "style-src-elem") ?? "").includes(hash));
  assert.doesNotMatch(policy, /unsafe-inline/);
  assert.throws(
    () => previewContentSecurityPolicy(ORIGIN, [`${hash}; script-src *`]),
    PreviewCspHashGenerationError,
  );
});

test("legacy HTML rewrite API uses the same structural policy", () => {
  const html = "<!doctype html><style>.x{color:red}</style><img src='./image.png'>";
  const rewritten = rewritePreviewHtmlAssetUrls(html, "index.html", signed);
  assert.match(rewritten, /token\/image\.png/);
  expectCode(
    () => rewritePreviewHtmlAssetUrls(
      "<!doctype html><p style='color:red'>x</p>",
      "index.html",
      signed,
    ),
    "STYLE_ATTRIBUTE_UNSUPPORTED",
  );
});
