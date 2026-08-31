import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseHTML } from "linkedom";
import { serializeJsonLd } from "../lib/safe-json-ld.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

test("safe JSON-LD serialization escapes the complete HTML script-context boundary", () => {
  const sentinel = "</script><script>globalThis.__ta027=1</script>";
  const caseVariant = "</ScRiPt><ScRiPt>globalThis.__ta027_case=1</ScRiPt>";
  const value = {
    sentinel,
    caseVariant,
    markup: "<!--comment--><tag attr='value'>&text</tag>",
    separators: "before\u2028middle\u2029after",
    ordinary: "quote=\" backslash=\\ newline=\n 日本語 😀",
    nested: { values: ["<", ">", "&", { sentinel }] },
  };

  const serialized = serializeJsonLd(value);

  assert.deepEqual(JSON.parse(serialized), value);
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/u);
  assert.match(serialized, /\\u003c\/script\\u003e\\u003cscript\\u003e/);
  assert.match(serialized, /\\u003c\/ScRiPt\\u003e\\u003cScRiPt\\u003e/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u2028/);
  assert.match(serialized, /\\u2029/);
});

test("safe JSON-LD serialization rejects a root value JSON cannot represent", () => {
  assert.throws(() => serializeJsonLd(undefined), /JSON_LD_VALUE_NOT_SERIALIZABLE/);
  assert.throws(() => serializeJsonLd(() => undefined), /JSON_LD_VALUE_NOT_SERIALIZABLE/);
});

test("serialized attacker-controlled values preserve the HTML script boundary", () => {
  const value = {
    sentinel: "</script><script>globalThis.__ta027=1</script>",
    caseVariant: "</ScRiPt><ScRiPt>globalThis.__ta027_case=1</ScRiPt>",
    markup: "<!--x--><tag>&</tag>",
    separators: "a\u2028b\u2029c",
  };
  const html = [
    "<!doctype html><html><body>",
    `<script id="json-ld" type="application/ld+json">${serializeJsonLd(value)}</script>`,
    '<main id="after">after-json-ld</main>',
    "</body></html>",
  ].join("");
  const { document } = parseHTML(html);
  const script = document.querySelector<HTMLScriptElement>("#json-ld");

  assert.equal(document.querySelectorAll('script[type="application/ld+json"]').length, 1);
  assert.equal(document.querySelectorAll("script").length, 1);
  assert.equal(document.querySelector("#after")?.textContent, "after-json-ld");
  assert.ok(script?.textContent);
  assert.deepEqual(JSON.parse(script.textContent), value);
});

test("every application/ld+json sink uses the common safe serializer", () => {
  const sinks = sourceFiles(resolve(repositoryRoot, "app"))
    .map((path) => ({
      path: relative(repositoryRoot, path).replaceAll("\\", "/"),
      source: readFileSync(path, "utf8"),
    }))
    .filter(({ source }) => source.includes("application/ld+json"));

  assert.deepEqual(sinks.map(({ path }) => path).sort(), [
    "app/games/GameLandingPage.tsx",
    "app/layout.tsx",
  ]);
  for (const { path, source } of sinks) {
    assert.match(source, /import \{ serializeJsonLd \} from "@\/lib\/safe-json-ld";/, path);
    const sinkCount = source.match(/type="application\/ld\+json"/g)?.length ?? 0;
    assert.equal(source.match(/__html: serializeJsonLd\(/g)?.length ?? 0, sinkCount, path);
    assert.doesNotMatch(source, /__html:\s*JSON\.stringify\(/, path);
    assert.doesNotMatch(source, /function\s+jsonLd\b|replaceAll\("<",\s*"\\\\u003c"\)/, path);
  }
});
