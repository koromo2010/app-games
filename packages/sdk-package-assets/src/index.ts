import { parse as parseJavaScript } from "@babel/parser";
import traverseModule, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { parse as parseHtml } from "parse5";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { parseSrcset } from "srcset";
import { posix } from "node:path";

export type PackageAssetFile = {
  path: string;
  content: string;
  encoding: "utf-8" | "base64";
  bytes: number;
};

export type GamePackageAssetFinding = {
  code:
    | "GAME_SDK_PACKAGE_ASSET_DYNAMIC_REFERENCE"
    | "GAME_SDK_PACKAGE_ASSET_PARSE_ERROR"
    | "GAME_SDK_PACKAGE_ASSET_OUTSIDE_ROOT"
    | "GAME_SDK_PACKAGE_ASSET_MISSING"
    | "GAME_SDK_PACKAGE_ASSET_CASE_MISMATCH"
    | "GAME_SDK_PACKAGE_ASSET_NOT_BROWSER_READABLE"
    | "GAME_SDK_PACKAGE_ASSET_ENCODING_INVALID";
  file: string;
  line: number;
  column: number;
  reference: string;
  hint: string;
};

export type GamePackageAssetAudit = {
  valid: boolean;
  findings: GamePackageAssetFinding[];
};

const SOURCE_EXTENSIONS = new Set([".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"]);
const BROWSER_EXTENSIONS = new Set([
  ".css", ".gif", ".ico", ".jpeg", ".jpg", ".js", ".mjs", ".cjs", ".json",
  ".mp3", ".mp4", ".ogg", ".png", ".svg", ".wav", ".webm", ".webp", ".woff", ".woff2",
]);
const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

function extension(path: string) {
  const name = path.toLowerCase();
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index);
}

export function isBrowserReadableGamePackageAsset(path: string) {
  if (path === "index.html") return true;
  if (path === "server.bundle.js" || path === "game-fields-package.json" || path === "preview.json" || path.startsWith("source/")) return false;
  return BROWSER_EXTENSIONS.has(extension(path));
}

function sourcePosition(line?: number | null, column?: number | null) {
  return { line: Math.max(1, line ?? 1), column: Math.max(1, (column ?? 0) + 1) };
}

function errorPosition(error: unknown) {
  const candidate = error as { line?: number; column?: number; lineNumber?: number; columnNumber?: number; loc?: { line?: number; column?: number } };
  return sourcePosition(candidate.loc?.line ?? candidate.line ?? candidate.lineNumber, candidate.loc?.column ?? candidate.column ?? candidate.columnNumber);
}

function ignoredReference(reference: string) {
  const value = reference.trim();
  return !value || value.startsWith("#") || value.startsWith("//") || /^(?:https?|data|blob|mailto|tel|javascript):/i.test(value);
}

function withoutSuffix(reference: string) {
  const end = reference.search(/[?#]/);
  return end < 0 ? reference : reference.slice(0, end);
}

function resolveReference(parent: string, reference: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutSuffix(reference.trim()).replaceAll("\\", "/"));
  } catch {
    return { outside: true, path: "" };
  }
  const raw = decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(parent), decoded);
  const normalized = posix.normalize(raw);
  return {
    outside: normalized === ".." || normalized.startsWith("../") || posix.isAbsolute(normalized),
    path: normalized.replace(/^\.\//, ""),
  };
}

function referenceLooksLikeAsset(reference: string) {
  const value = withoutSuffix(reference.trim());
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || /\.[A-Za-z0-9]{1,8}$/.test(value);
}

type FindingSink = (finding: GamePackageAssetFinding) => void;

function inspectReference(input: {
  parent: string;
  reference: string;
  line?: number | null;
  column?: number | null;
  exactPaths: ReadonlySet<string>;
  foldedPaths: ReadonlyMap<string, string[]>;
  add: FindingSink;
}) {
  const reference = input.reference.trim();
  if (ignoredReference(reference)) return;
  if (!referenceLooksLikeAsset(reference)) return;
  const position = sourcePosition(input.line, input.column);
  const resolved = resolveReference(input.parent, reference);
  if (resolved.outside) {
    input.add({ code: "GAME_SDK_PACKAGE_ASSET_OUTSIDE_ROOT", file: input.parent, ...position, reference, hint: "Keep package-relative assets inside the package root." });
    return;
  }
  if (!input.exactPaths.has(resolved.path)) {
    const alternatives = input.foldedPaths.get(resolved.path.toLowerCase()) ?? [];
    input.add({
      code: alternatives.length > 0 ? "GAME_SDK_PACKAGE_ASSET_CASE_MISMATCH" : "GAME_SDK_PACKAGE_ASSET_MISSING",
      file: input.parent,
      ...position,
      reference,
      hint: alternatives.length > 0 ? `Use the exact path casing: ${alternatives[0]}` : `Add the referenced file: ${resolved.path}`,
    });
    return;
  }
  if (!isBrowserReadableGamePackageAsset(resolved.path)) {
    input.add({ code: "GAME_SDK_PACKAGE_ASSET_NOT_BROWSER_READABLE", file: input.parent, ...position, reference, hint: "Move browser assets outside reserved server, manifest, and source paths." });
  }
}

function dynamicFinding(file: string, node: t.Node, reference: string, add: FindingSink) {
  const position = sourcePosition(node.loc?.start.line, node.loc?.start.column);
  add({ code: "GAME_SDK_PACKAGE_ASSET_DYNAMIC_REFERENCE", file, ...position, reference, hint: "Replace the dynamic asset reference with one statically resolvable package-relative path." });
}

function staticString(path: NodePath<t.Expression>, seen = new Set<t.Node>()): string | null {
  const node = path.node;
  if (seen.has(node)) return null;
  seen.add(node);
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node)) {
    let value = node.quasis[0]?.value.cooked ?? "";
    for (let index = 0; index < node.expressions.length; index += 1) {
      const expressionPath = path.get(`expressions.${index}`) as NodePath<t.Expression>;
      const part = staticString(expressionPath, seen);
      if (part === null) return null;
      value += part + (node.quasis[index + 1]?.value.cooked ?? "");
    }
    return value;
  }
  if (t.isBinaryExpression(node, { operator: "+" })) {
    const left = staticString(path.get("left") as NodePath<t.Expression>, seen);
    const right = staticString(path.get("right") as NodePath<t.Expression>, seen);
    return left === null || right === null ? null : left + right;
  }
  if (t.isIdentifier(node)) {
    const binding = path.scope.getBinding(node.name);
    if (!binding?.constant || !binding.path.isVariableDeclarator()) return null;
    const init = binding.path.get("init");
    return init?.isExpression() ? staticString(init, seen) : null;
  }
  return null;
}

function expressionSource(source: string, node: t.Node) {
  return typeof node.start === "number" && typeof node.end === "number" ? source.slice(node.start, node.end) : "<dynamic>";
}

function inspectJavaScript(file: PackageAssetFile, exactPaths: ReadonlySet<string>, foldedPaths: ReadonlyMap<string, string[]>, add: FindingSink) {
  let ast: t.File;
  try {
    ast = parseJavaScript(file.content, { sourceType: "unambiguous", errorRecovery: false, plugins: ["typescript", "jsx", "importMeta", "dynamicImport"] });
  } catch (error) {
    const position = errorPosition(error);
    add({ code: "GAME_SDK_PACKAGE_ASSET_PARSE_ERROR", file: file.path, ...position, reference: "", hint: "Fix the JavaScript or TypeScript parse error before saving." });
    return;
  }
  const check = (path: NodePath<t.Expression>, contextNode: t.Node) => {
    const value = staticString(path);
    if (value !== null) {
      if (referenceLooksLikeAsset(value)) inspectReference({ parent: file.path, reference: value, line: contextNode.loc?.start.line, column: contextNode.loc?.start.column, exactPaths, foldedPaths, add });
      return;
    }
    dynamicFinding(file.path, contextNode, expressionSource(file.content, path.node), add);
  };
  traverse(ast, {
    ImportDeclaration(path) { inspectReference({ parent: file.path, reference: path.node.source.value, line: path.node.source.loc?.start.line, column: path.node.source.loc?.start.column, exactPaths, foldedPaths, add }); },
    ExportNamedDeclaration(path) { if (path.node.source) inspectReference({ parent: file.path, reference: path.node.source.value, line: path.node.source.loc?.start.line, column: path.node.source.loc?.start.column, exactPaths, foldedPaths, add }); },
    ExportAllDeclaration(path) { inspectReference({ parent: file.path, reference: path.node.source.value, line: path.node.source.loc?.start.line, column: path.node.source.loc?.start.column, exactPaths, foldedPaths, add }); },
    CallExpression(path) {
      if (path.node.callee.type === "Import" && path.get("arguments.0").isExpression()) check(path.get("arguments.0") as NodePath<t.Expression>, path.node);
      if (t.isIdentifier(path.node.callee, { name: "fetch" }) && path.get("arguments.0").isExpression()) check(path.get("arguments.0") as NodePath<t.Expression>, path.node);
    },
    NewExpression(path) {
      if (t.isIdentifier(path.node.callee, { name: "URL" }) && path.get("arguments.0").isExpression()) check(path.get("arguments.0") as NodePath<t.Expression>, path.node);
    },
    AssignmentExpression(path) {
      const left = path.node.left;
      const property = t.isMemberExpression(left) && !left.computed && t.isIdentifier(left.property) ? left.property.name : "";
      if (["src", "href", "poster", "srcset"].includes(property) && path.get("right").isExpression()) check(path.get("right") as NodePath<t.Expression>, path.node);
    },
  });
}

function inspectHtml(file: PackageAssetFile, exactPaths: ReadonlySet<string>, foldedPaths: ReadonlyMap<string, string[]>, add: FindingSink) {
  try {
    const parseErrors: Array<{ startLine?: number; startCol?: number }> = [];
    const document = parseHtml(file.content, {
      sourceCodeLocationInfo: true,
      onParseError: (error) => parseErrors.push(error),
    }) as unknown as { childNodes?: unknown[] };
    for (const error of parseErrors) {
      add({
        code: "GAME_SDK_PACKAGE_ASSET_PARSE_ERROR",
        file: file.path,
        line: Math.max(1, error.startLine ?? 1),
        column: Math.max(1, error.startCol ?? 1),
        reference: "",
        hint: "Fix the HTML parse error before saving.",
      });
    }
    const visit = (node: unknown) => {
      const item = node as { attrs?: Array<{ name: string; value: string }>; childNodes?: unknown[]; content?: { childNodes?: unknown[] }; sourceCodeLocation?: { attrs?: Record<string, { startLine?: number; startCol?: number }> } };
      for (const attr of item.attrs ?? []) {
        if (!["src", "href", "poster", "srcset"].includes(attr.name)) continue;
        const location = item.sourceCodeLocation?.attrs?.[attr.name];
        const references = attr.name === "srcset" ? parseSrcset(attr.value).map((candidate) => candidate.url) : [attr.value];
        for (const reference of references) inspectReference({ parent: file.path, reference, line: location?.startLine, column: location?.startCol ? location.startCol - 1 : 0, exactPaths, foldedPaths, add });
      }
      for (const child of [...(item.childNodes ?? []), ...(item.content?.childNodes ?? [])]) visit(child);
    };
    visit(document);
  } catch (error) {
    const position = errorPosition(error);
    add({ code: "GAME_SDK_PACKAGE_ASSET_PARSE_ERROR", file: file.path, ...position, reference: "", hint: "Fix the HTML parse error before saving." });
  }
}

function inspectCss(file: PackageAssetFile, exactPaths: ReadonlySet<string>, foldedPaths: ReadonlyMap<string, string[]>, add: FindingSink) {
  try {
    const root = postcss.parse(file.content, { from: file.path });
    root.walkAtRules("import", (rule) => {
      const parsed = valueParser(rule.params);
      const first = parsed.nodes.find((node) => node.type === "string" || node.type === "word" || (node.type === "function" && node.value.toLowerCase() === "url"));
      const reference = first?.type === "function" ? valueParser.stringify(first.nodes).replace(/^['"]|['"]$/g, "") : first?.value;
      if (reference) inspectReference({ parent: file.path, reference, line: rule.source?.start?.line, column: rule.source?.start?.column ? rule.source.start.column - 1 : 0, exactPaths, foldedPaths, add });
    });
    root.walkDecls((decl) => {
      const parsed = valueParser(decl.value);
      parsed.walk((node) => {
        if (node.type !== "function" || node.value.toLowerCase() !== "url") return;
        const reference = valueParser.stringify(node.nodes).trim().replace(/^['"]|['"]$/g, "");
        inspectReference({ parent: file.path, reference, line: decl.source?.start?.line, column: decl.source?.start?.column ? decl.source.start.column - 1 : 0, exactPaths, foldedPaths, add });
        return false;
      });
    });
  } catch (error) {
    const position = errorPosition(error);
    add({ code: "GAME_SDK_PACKAGE_ASSET_PARSE_ERROR", file: file.path, ...position, reference: "", hint: "Fix the CSS parse error before saving." });
  }
}

export function auditGamePackageAssets(files: readonly PackageAssetFile[]): GamePackageAssetAudit {
  const findings: GamePackageAssetFinding[] = [];
  const add: FindingSink = (finding) => findings.push(finding);
  const exactPaths = new Set(files.map((file) => file.path));
  const foldedPaths = new Map<string, string[]>();
  for (const path of exactPaths) foldedPaths.set(path.toLowerCase(), [...(foldedPaths.get(path.toLowerCase()) ?? []), path].sort());
  for (const file of [...files].sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)))) {
    if (!SOURCE_EXTENSIONS.has(extension(file.path))) continue;
    if (file.encoding !== "utf-8" || file.content.includes("\0")) {
      add({ code: "GAME_SDK_PACKAGE_ASSET_ENCODING_INVALID", file: file.path, line: 1, column: 1, reference: "", hint: "Source files must be valid UTF-8 text." });
      continue;
    }
    if ([".html", ".htm"].includes(extension(file.path))) inspectHtml(file, exactPaths, foldedPaths, add);
    else if (extension(file.path) === ".css") inspectCss(file, exactPaths, foldedPaths, add);
    else inspectJavaScript(file, exactPaths, foldedPaths, add);
  }
  findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column || left.code.localeCompare(right.code) || left.reference.localeCompare(right.reference));
  return { valid: findings.length === 0, findings };
}

export class GamePackageAssetValidationError extends Error {
  readonly findings: readonly GamePackageAssetFinding[];

  constructor(findings: readonly GamePackageAssetFinding[]) {
    super(findings[0]?.code ?? "GAME_SDK_PACKAGE_ASSET_INVALID");
    this.name = "GamePackageAssetValidationError";
    this.findings = findings;
  }
}

export function assertGamePackageAssets(files: readonly PackageAssetFile[]) {
  const audit = auditGamePackageAssets(files);
  if (!audit.valid) throw new GamePackageAssetValidationError(audit.findings);
  return audit;
}
