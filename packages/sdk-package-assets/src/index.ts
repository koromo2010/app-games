import { parse as parseJavaScript } from "@babel/parser";
import traverseModule, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { parse as parseHtml } from "parse5";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { parseSrcset, stringifySrcset } from "srcset";
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
    | "GAME_SDK_PACKAGE_ASSET_ENCODING_INVALID"
    | "GAME_SDK_PACKAGE_BASE_ELEMENT_UNSUPPORTED"
    | "GAME_SDK_PACKAGE_INLINE_SCRIPT_UNSUPPORTED"
    | "GAME_SDK_PACKAGE_EVENT_HANDLER_UNSUPPORTED"
    | "GAME_SDK_PACKAGE_STYLE_ATTRIBUTE_UNSUPPORTED"
    | "GAME_SDK_PACKAGE_INLINE_STYLE_PARSE_ERROR"
    | "GAME_SDK_PACKAGE_INLINE_STYLE_ASSET_INVALID";
  file: string;
  line: number;
  column: number;
  reference: string;
  hint: string;
};

export type GamePackageServerFinding = {
  code:
    | "GAME_SDK_PACKAGE_SERVER_ENTRY_MISSING"
    | "GAME_SDK_PACKAGE_SERVER_ENTRY_ENCODING_INVALID"
    | "GAME_SDK_PACKAGE_SERVER_ENTRY_PARSE_ERROR"
    | "GAME_SDK_PACKAGE_SERVER_SOURCE_MISSING"
    | "GAME_SDK_PACKAGE_SERVER_SOURCE_CASE_MISMATCH"
    | "GAME_SDK_PACKAGE_SERVER_SOURCE_OUTSIDE_ROOT"
    | "GAME_SDK_PACKAGE_SERVER_SOURCE_DYNAMIC_REFERENCE"
    | "GAME_SDK_PACKAGE_SERVER_SOURCE_PARSE_ERROR"
    | "GAME_SDK_PACKAGE_SERVER_SOURCE_ENCODING_INVALID";
  file: string;
  line: number;
  column: number;
  reference: string;
  hint: string;
};

export type GamePackageFinding = GamePackageAssetFinding | GamePackageServerFinding;

export type GamePackageAssetAudit = {
  valid: boolean;
  findings: GamePackageAssetFinding[];
};

export type GamePackageAudit = {
  valid: boolean;
  findings: GamePackageFinding[];
};

export type GamePackageServerAudit = {
  valid: boolean;
  findings: GamePackageServerFinding[];
};

export type NormalizedGamePackageAssetReference = {
  outside: boolean;
  path: string;
  fragment: string;
};

export type GamePackageHtmlPolicyErrorCode =
  | "HTML_PARSE_ERROR"
  | "BASE_ELEMENT_UNSUPPORTED"
  | "INLINE_SCRIPT_UNSUPPORTED"
  | "EVENT_HANDLER_UNSUPPORTED"
  | "STYLE_ATTRIBUTE_UNSUPPORTED"
  | "INLINE_STYLE_PARSE_ERROR"
  | "INLINE_STYLE_ASSET_INVALID";

export type GamePackageDocumentReferenceContext =
  | "html-attribute"
  | "inline-style"
  | "stylesheet";

export type GamePackageDocumentAssetReference = {
  parent: string;
  reference: string;
  context: GamePackageDocumentReferenceContext;
  kind: "src" | "href" | "poster" | "srcset" | "url" | "import";
  line: number;
  column: number;
};

export type GamePackageInlineStyle = {
  content: string;
  startOffset: number;
  endOffset: number;
  line: number;
  column: number;
};

export type GamePackageHtmlPolicyIssue = {
  code: GamePackageHtmlPolicyErrorCode;
  line: number;
  column: number;
};

export type GamePackageHtmlAnalysis = {
  issues: GamePackageHtmlPolicyIssue[];
  references: GamePackageDocumentAssetReference[];
  inlineStyles: GamePackageInlineStyle[];
};

export class GamePackageHtmlPolicyError extends Error {
  readonly code: GamePackageHtmlPolicyErrorCode;
  readonly line: number;
  readonly column: number;

  constructor(issue: GamePackageHtmlPolicyIssue) {
    super(issue.code);
    this.name = "GamePackageHtmlPolicyError";
    this.code = issue.code;
    this.line = issue.line;
    this.column = issue.column;
  }
}

const SOURCE_EXTENSIONS = new Set([".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"]);
const SERVER_SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"]);
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
  if (path === "server.bundle.js" || path === "game-fields-package.json" || path === "preview.json" || path.startsWith("source/")) return false;
  if ([".html", ".htm"].includes(extension(path))) return true;
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

export function normalizeGamePackageAssetReference(
  parent: string,
  reference: string,
): NormalizedGamePackageAssetReference | null {
  const trimmed = reference.trim();
  if (ignoredReference(trimmed)) return null;
  const hashIndex = trimmed.indexOf("#");
  const fragment = hashIndex < 0 ? "" : trimmed.slice(hashIndex);
  const pathAndQuery = hashIndex < 0 ? trimmed : trimmed.slice(0, hashIndex);
  const queryIndex = pathAndQuery.indexOf("?");
  const pathReference = queryIndex < 0 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathReference.replaceAll("\\", "/"));
  } catch {
    return { outside: true, path: "", fragment };
  }
  const raw = decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(parent), decoded);
  const normalized = posix.normalize(raw);
  return {
    outside: normalized === ".." || normalized.startsWith("../") || posix.isAbsolute(normalized),
    path: normalized.replace(/^\.\//, ""),
    fragment,
  };
}

type PackageManifestRoles = {
  /** Root of the browser-reachable graph. */
  clientEntry: string;
  /** Server runtime bundle; it is never inspected as a browser asset graph. */
  serverEntry: string;
  /** Root/declared identity of the server source tree; it is never browser-readable. */
  appSetSource: string;
};

function packageManifestRoles(files: readonly PackageAssetFile[]): PackageManifestRoles {
  const manifest = files.find((file) => file.path === "game-fields-package.json");
  if (!manifest || manifest.encoding !== "utf-8") {
    return { clientEntry: "index.html", serverEntry: "server.bundle.js", appSetSource: "source/app-set.ts" };
  }
  try {
    const parsed = JSON.parse(manifest.content) as {
      client?: { entry?: unknown };
      server?: { entry?: unknown; appSetSource?: unknown };
    };
    return {
      clientEntry: typeof parsed.client?.entry === "string" ? parsed.client.entry : "index.html",
      serverEntry: typeof parsed.server?.entry === "string" ? parsed.server.entry : "server.bundle.js",
      appSetSource: typeof parsed.server?.appSetSource === "string" ? parsed.server.appSetSource : "source/app-set.ts",
    };
  } catch {
    return { clientEntry: "index.html", serverEntry: "server.bundle.js", appSetSource: "source/app-set.ts" };
  }
}

function referenceLooksLikeAsset(reference: string) {
  const value = withoutSuffix(reference.trim());
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || /\.[A-Za-z0-9]{1,8}$/.test(value);
}

type FindingSink = (finding: GamePackageFinding) => void;

type ReferenceInput = {
  parent: string;
  reference: string;
  line?: number | null;
  column?: number | null;
};

type ReferenceObserver = (input: ReferenceInput) => void;

type JavaScriptInspectionOptions = {
  inspectReference?: (input: ReferenceInput) => void;
  observeReference?: ReferenceObserver;
  dynamicFinding?: (file: string, node: t.Node, reference: string, add: FindingSink) => void;
  parseFinding?: (file: PackageAssetFile, error: unknown, add: FindingSink) => void;
};

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
  const resolved = normalizeGamePackageAssetReference(input.parent, reference);
  if (!resolved) return;
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

function inspectJavaScript(
  file: PackageAssetFile,
  exactPaths: ReadonlySet<string>,
  foldedPaths: ReadonlyMap<string, string[]>,
  add: FindingSink,
  options: JavaScriptInspectionOptions = {},
) {
  const inspect = (input: ReferenceInput) => {
    options.observeReference?.(input);
    (options.inspectReference ?? ((referenceInput) => inspectReference({ ...referenceInput, exactPaths, foldedPaths, add })))(input);
  };
  const addDynamicFinding = options.dynamicFinding ?? dynamicFinding;
  let ast: t.File;
  try {
    ast = parseJavaScript(file.content, { sourceType: "unambiguous", errorRecovery: false, plugins: ["typescript", "jsx", "importMeta", "dynamicImport"] });
  } catch (error) {
    if (options.parseFinding) options.parseFinding(file, error, add);
    else {
      const position = errorPosition(error);
      add({ code: "GAME_SDK_PACKAGE_ASSET_PARSE_ERROR", file: file.path, ...position, reference: "", hint: "Fix the JavaScript or TypeScript parse error before saving." });
    }
    return;
  }
  const check = (path: NodePath<t.Expression>, contextNode: t.Node) => {
    const value = staticString(path);
    if (value !== null) {
      if (referenceLooksLikeAsset(value)) inspect({ parent: file.path, reference: value, line: contextNode.loc?.start.line, column: contextNode.loc?.start.column });
      return;
    }
    addDynamicFinding(file.path, contextNode, expressionSource(file.content, path.node), add);
  };
  traverse(ast, {
    ImportDeclaration(path) { inspect({ parent: file.path, reference: path.node.source.value, line: path.node.source.loc?.start.line, column: path.node.source.loc?.start.column }); },
    ExportNamedDeclaration(path) { if (path.node.source) inspect({ parent: file.path, reference: path.node.source.value, line: path.node.source.loc?.start.line, column: path.node.source.loc?.start.column }); },
    ExportAllDeclaration(path) { inspect({ parent: file.path, reference: path.node.source.value, line: path.node.source.loc?.start.line, column: path.node.source.loc?.start.column }); },
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

type HtmlSourceLocation = {
  startLine?: number;
  startCol?: number;
  startOffset?: number;
  endLine?: number;
  endCol?: number;
  endOffset?: number;
  attrs?: Record<string, HtmlSourceLocation>;
  startTag?: HtmlSourceLocation;
  endTag?: HtmlSourceLocation;
};

type HtmlNode = {
  nodeName?: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
  content?: { childNodes?: HtmlNode[] };
  sourceCodeLocation?: HtmlSourceLocation;
};

type HtmlAttributeTarget = {
  name: "src" | "href" | "poster" | "srcset";
  value: string;
  startOffset: number;
  endOffset: number;
  line: number;
  column: number;
};

type StructuralHtmlAnalysis = GamePackageHtmlAnalysis & {
  attributes: HtmlAttributeTarget[];
};

type CssValueNode = {
  type: string;
  value: string;
  quote?: string;
  nodes?: CssValueNode[];
};

export type RewriteGamePackageDocumentReference = (
  input: GamePackageDocumentAssetReference,
) => string;

function htmlPosition(location?: HtmlSourceLocation) {
  return {
    line: Math.max(1, location?.startLine ?? 1),
    column: Math.max(1, location?.startCol ?? 1),
  };
}

function inlineCssPosition(
  style: GamePackageInlineStyle,
  line?: number,
  column?: number,
) {
  const relativeLine = Math.max(1, line ?? 1);
  const relativeColumn = Math.max(1, column ?? 1);
  return {
    line: style.line + relativeLine - 1,
    column: relativeLine === 1
      ? style.column + relativeColumn - 1
      : relativeColumn,
  };
}

function simpleCssReference(
  nodes: readonly CssValueNode[],
  issue: GamePackageHtmlPolicyIssue,
) {
  const meaningful = nodes.filter((node) => (
    node.type !== "space" && node.type !== "comment"
  ));
  if (
    meaningful.length !== 1
    || !["string", "word"].includes(meaningful[0]?.type ?? "")
    || !(meaningful[0]?.value.trim())
    || (meaningful[0]?.type === "word" && /[()]/.test(meaningful[0].value))
  ) {
    throw new GamePackageHtmlPolicyError(issue);
  }
  return meaningful[0]!.value;
}

function quotedCssValue(value: string, issue: GamePackageHtmlPolicyIssue) {
  if (/\0|[\r\n]/.test(value)) {
    throw new GamePackageHtmlPolicyError(issue);
  }
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const node = valueParser(`"${escaped}"`).nodes[0] as unknown as CssValueNode | undefined;
  if (!node) throw new GamePackageHtmlPolicyError(issue);
  return node;
}

function processInlineStyle(
  style: GamePackageInlineStyle,
  parent: string,
  rewriteReference?: RewriteGamePackageDocumentReference,
) {
  const references: GamePackageDocumentAssetReference[] = [];
  let root: ReturnType<typeof postcss.parse>;
  try {
    root = postcss.parse(style.content, { from: parent });
  } catch (error) {
    const relative = errorPosition(error);
    throw new GamePackageHtmlPolicyError({
      code: "INLINE_STYLE_PARSE_ERROR",
      ...inlineCssPosition(style, relative.line, relative.column),
    });
  }
  root.walkAtRules("import", (rule) => {
    const position = inlineCssPosition(
      style,
      rule.source?.start?.line,
      rule.source?.start?.column,
    );
    const issue = { code: "INLINE_STYLE_ASSET_INVALID" as const, ...position };
    const parsed = valueParser(rule.params);
    const first = (parsed.nodes as unknown as CssValueNode[]).find((node) => (
      node.type !== "space" && node.type !== "comment"
    ));
    if (!first) throw new GamePackageHtmlPolicyError(issue);
    const reference = first.type === "function"
      && first.value.toLowerCase() === "url"
      ? simpleCssReference(first.nodes ?? [], issue)
      : simpleCssReference([first], issue);
    const input: GamePackageDocumentAssetReference = {
      parent,
      reference,
      context: "inline-style",
      kind: "import",
      ...position,
    };
    references.push(input);
    if (!rewriteReference) return;
    const rewritten = rewriteReference(input);
    const replacement = quotedCssValue(rewritten, issue);
    if (first.type === "function") first.nodes = [replacement];
    else Object.assign(first, replacement);
    rule.params = parsed.toString();
  });
  root.walkDecls((decl) => {
    const parsed = valueParser(decl.value);
    parsed.walk((rawNode) => {
      const node = rawNode as unknown as CssValueNode;
      if (node.type !== "function" || node.value.toLowerCase() !== "url") {
        return undefined;
      }
      const position = inlineCssPosition(
        style,
        decl.source?.start?.line,
        decl.source?.start?.column,
      );
      const issue = { code: "INLINE_STYLE_ASSET_INVALID" as const, ...position };
      const reference = simpleCssReference(node.nodes ?? [], issue);
      const input: GamePackageDocumentAssetReference = {
        parent,
        reference,
        context: "inline-style",
        kind: "url",
        ...position,
      };
      references.push(input);
      if (rewriteReference) {
        node.nodes = [quotedCssValue(rewriteReference(input), issue)];
        decl.value = parsed.toString();
      }
      return false;
    });
  });
  return { content: root.toString(), references };
}

function structuralHtmlAnalysis(
  html: string,
  documentAssetPath: string,
): StructuralHtmlAnalysis {
  const issues: GamePackageHtmlPolicyIssue[] = [];
  const references: GamePackageDocumentAssetReference[] = [];
  const inlineStyles: GamePackageInlineStyle[] = [];
  const attributes: HtmlAttributeTarget[] = [];
  const parseErrors: HtmlSourceLocation[] = [];
  let document: HtmlNode;
  try {
    document = parseHtml(html, {
      sourceCodeLocationInfo: true,
      onParseError: (error) => parseErrors.push(error),
    }) as unknown as HtmlNode;
  } catch (error) {
    const position = errorPosition(error);
    return {
      issues: [{ code: "HTML_PARSE_ERROR", ...position }],
      references,
      inlineStyles,
      attributes,
    };
  }
  for (const error of parseErrors) {
    issues.push({ code: "HTML_PARSE_ERROR", ...htmlPosition(error) });
  }
  const visit = (node: HtmlNode) => {
    const location = node.sourceCodeLocation;
    const position = htmlPosition(location);
    const tagName = node.tagName?.toLowerCase();
    if (tagName === "base") {
      issues.push({ code: "BASE_ELEMENT_UNSUPPORTED", ...position });
    }
    const attrs = node.attrs ?? [];
    if (
      tagName === "script"
      && !attrs.some((attr) => attr.name.toLowerCase() === "src" && attr.value.trim())
    ) {
      issues.push({ code: "INLINE_SCRIPT_UNSUPPORTED", ...position });
    }
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      const attrLocation = location?.attrs?.[attr.name] ?? location?.attrs?.[name];
      const attrPosition = htmlPosition(attrLocation ?? location);
      if (name === "style") {
        issues.push({ code: "STYLE_ATTRIBUTE_UNSUPPORTED", ...attrPosition });
      }
      if (name.startsWith("on")) {
        issues.push({ code: "EVENT_HANDLER_UNSUPPORTED", ...attrPosition });
      }
      if (!["src", "href", "poster", "srcset"].includes(name)) continue;
      if (
        typeof attrLocation?.startOffset !== "number"
        || typeof attrLocation.endOffset !== "number"
      ) {
        issues.push({ code: "HTML_PARSE_ERROR", ...attrPosition });
        continue;
      }
      const attribute = {
        name: name as HtmlAttributeTarget["name"],
        value: attr.value,
        startOffset: attrLocation.startOffset,
        endOffset: attrLocation.endOffset,
        ...attrPosition,
      };
      attributes.push(attribute);
      try {
        const values = name === "srcset"
          ? parseSrcset(attr.value, { strict: true }).map((candidate) => candidate.url)
          : [attr.value];
        for (const reference of values) {
          references.push({
            parent: documentAssetPath,
            reference,
            context: "html-attribute",
            kind: name as GamePackageDocumentAssetReference["kind"],
            ...attrPosition,
          });
        }
      } catch {
        issues.push({ code: "HTML_PARSE_ERROR", ...attrPosition });
      }
    }
    if (tagName === "style") {
      const startOffset = location?.startTag?.endOffset;
      const endOffset = location?.endTag?.startOffset;
      if (typeof startOffset !== "number" || typeof endOffset !== "number") {
        issues.push({ code: "HTML_PARSE_ERROR", ...position });
      } else {
        const style: GamePackageInlineStyle = {
          content: html.slice(startOffset, endOffset),
          startOffset,
          endOffset,
          line: Math.max(1, location?.startTag?.endLine ?? position.line),
          column: Math.max(1, location?.startTag?.endCol ?? position.column),
        };
        inlineStyles.push(style);
        try {
          references.push(...processInlineStyle(
            style,
            documentAssetPath,
          ).references);
        } catch (error) {
          if (error instanceof GamePackageHtmlPolicyError) {
            issues.push({ code: error.code, line: error.line, column: error.column });
          } else {
            issues.push({ code: "INLINE_STYLE_PARSE_ERROR", ...position });
          }
        }
      }
    }
    for (const child of [
      ...(node.childNodes ?? []),
      ...(node.content?.childNodes ?? []),
    ]) visit(child);
  };
  visit(document);
  issues.sort((left, right) => (
    left.line - right.line
    || left.column - right.column
    || left.code.localeCompare(right.code)
  ));
  references.sort((left, right) => (
    left.line - right.line
    || left.column - right.column
    || left.kind.localeCompare(right.kind)
    || left.reference.localeCompare(right.reference)
  ));
  inlineStyles.sort((left, right) => left.startOffset - right.startOffset);
  attributes.sort((left, right) => left.startOffset - right.startOffset);
  return { issues, references, inlineStyles, attributes };
}

export function analyzeGamePackageHtmlDocument(
  html: string,
  documentAssetPath: string,
): GamePackageHtmlAnalysis {
  const { issues, references, inlineStyles } = structuralHtmlAnalysis(
    html,
    documentAssetPath,
  );
  return { issues, references, inlineStyles };
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function applyTextReplacements(
  source: string,
  replacements: Array<{ startOffset: number; endOffset: number; value: string }>,
) {
  let output = source;
  let previousStart = source.length;
  for (const replacement of [...replacements].sort((left, right) => (
    right.startOffset - left.startOffset || right.endOffset - left.endOffset
  ))) {
    if (
      replacement.startOffset < 0
      || replacement.endOffset < replacement.startOffset
      || replacement.endOffset > source.length
      || replacement.endOffset > previousStart
    ) {
      throw new GamePackageHtmlPolicyError({
        code: "HTML_PARSE_ERROR",
        line: 1,
        column: 1,
      });
    }
    output = `${output.slice(0, replacement.startOffset)}${replacement.value}${output.slice(replacement.endOffset)}`;
    previousStart = replacement.startOffset;
  }
  return output;
}

export function rewriteGamePackageHtmlDocument(
  html: string,
  documentAssetPath: string,
  rewriteReference: RewriteGamePackageDocumentReference,
) {
  const analysis = structuralHtmlAnalysis(html, documentAssetPath);
  const issue = analysis.issues[0];
  if (issue) throw new GamePackageHtmlPolicyError(issue);
  const replacements: Array<{
    startOffset: number;
    endOffset: number;
    value: string;
  }> = [];
  for (const attribute of analysis.attributes) {
    let value: string;
    if (attribute.name === "srcset") {
      const candidates = parseSrcset(attribute.value, { strict: true });
      value = stringifySrcset(candidates.map((candidate) => ({
        ...candidate,
        url: rewriteReference({
          parent: documentAssetPath,
          reference: candidate.url,
          context: "html-attribute",
          kind: "srcset",
          line: attribute.line,
          column: attribute.column,
        }),
      })), { strict: true });
    } else {
      value = rewriteReference({
        parent: documentAssetPath,
        reference: attribute.value,
        context: "html-attribute",
        kind: attribute.name,
        line: attribute.line,
        column: attribute.column,
      });
    }
    if (value !== attribute.value) {
      replacements.push({
        startOffset: attribute.startOffset,
        endOffset: attribute.endOffset,
        value: `${attribute.name}="${escapeHtmlAttribute(value)}"`,
      });
    }
  }
  const inlineStyleContents: string[] = [];
  for (const style of analysis.inlineStyles) {
    const rewritten = processInlineStyle(
      style,
      documentAssetPath,
      rewriteReference,
    ).content;
    inlineStyleContents.push(rewritten);
    if (rewritten !== style.content) {
      replacements.push({
        startOffset: style.startOffset,
        endOffset: style.endOffset,
        value: rewritten,
      });
    }
  }
  return {
    html: applyTextReplacements(html, replacements),
    inlineStyleContents,
  };
}

function inspectHtml(
  file: PackageAssetFile,
  exactPaths: ReadonlySet<string>,
  foldedPaths: ReadonlyMap<string, string[]>,
  add: FindingSink,
  observeReference?: ReferenceObserver,
) {
  const inspect = (input: ReferenceInput) => {
    observeReference?.(input);
    inspectReference({ ...input, exactPaths, foldedPaths, add });
  };
  const analysis = analyzeGamePackageHtmlDocument(file.content, file.path);
  const issueCodes: Record<GamePackageHtmlPolicyErrorCode, GamePackageAssetFinding["code"]> = {
    HTML_PARSE_ERROR: "GAME_SDK_PACKAGE_ASSET_PARSE_ERROR",
    BASE_ELEMENT_UNSUPPORTED: "GAME_SDK_PACKAGE_BASE_ELEMENT_UNSUPPORTED",
    INLINE_SCRIPT_UNSUPPORTED: "GAME_SDK_PACKAGE_INLINE_SCRIPT_UNSUPPORTED",
    EVENT_HANDLER_UNSUPPORTED: "GAME_SDK_PACKAGE_EVENT_HANDLER_UNSUPPORTED",
    STYLE_ATTRIBUTE_UNSUPPORTED: "GAME_SDK_PACKAGE_STYLE_ATTRIBUTE_UNSUPPORTED",
    INLINE_STYLE_PARSE_ERROR: "GAME_SDK_PACKAGE_INLINE_STYLE_PARSE_ERROR",
    INLINE_STYLE_ASSET_INVALID: "GAME_SDK_PACKAGE_INLINE_STYLE_ASSET_INVALID",
  };
  const issueHints: Record<GamePackageHtmlPolicyErrorCode, string> = {
    HTML_PARSE_ERROR: "Fix the HTML parse error before saving.",
    BASE_ELEMENT_UNSUPPORTED: "Remove the base element and use package-relative asset references.",
    INLINE_SCRIPT_UNSUPPORTED: "Move inline scripts into a browser-readable package JavaScript asset.",
    EVENT_HANDLER_UNSUPPORTED: "Move inline event handlers into a browser-readable package JavaScript asset.",
    STYLE_ATTRIBUTE_UNSUPPORTED: "Move style attributes into an external stylesheet or a static style element.",
    INLINE_STYLE_PARSE_ERROR: "Fix the inline style CSS parse error before saving.",
    INLINE_STYLE_ASSET_INVALID: "Use a static package-relative URL or import in inline style CSS.",
  };
  for (const issue of analysis.issues) {
    add({
      code: issueCodes[issue.code],
      file: file.path,
      line: issue.line,
      column: issue.column,
      reference: "",
      hint: issueHints[issue.code],
    });
  }
  for (const reference of analysis.references) {
    inspect({
      parent: reference.parent,
      reference: reference.reference,
      line: reference.line,
      column: reference.column - 1,
    });
  }
}

function inspectCss(
  file: PackageAssetFile,
  exactPaths: ReadonlySet<string>,
  foldedPaths: ReadonlyMap<string, string[]>,
  add: FindingSink,
  observeReference?: ReferenceObserver,
) {
  const inspect = (input: ReferenceInput) => {
    observeReference?.(input);
    inspectReference({ ...input, exactPaths, foldedPaths, add });
  };
  try {
    const root = postcss.parse(file.content, { from: file.path });
    root.walkAtRules("import", (rule) => {
      const parsed = valueParser(rule.params);
      const first = parsed.nodes.find((node) => node.type === "string" || node.type === "word" || (node.type === "function" && node.value.toLowerCase() === "url"));
      const reference = first?.type === "function" ? valueParser.stringify(first.nodes).replace(/^['"]|['"]$/g, "") : first?.value;
      if (reference) inspect({ parent: file.path, reference, line: rule.source?.start?.line, column: rule.source?.start?.column ? rule.source.start.column - 1 : 0 });
    });
    root.walkDecls((decl) => {
      const parsed = valueParser(decl.value);
      parsed.walk((node) => {
        if (node.type !== "function" || node.value.toLowerCase() !== "url") return;
        const reference = valueParser.stringify(node.nodes).trim().replace(/^['"]|['"]$/g, "");
        inspect({ parent: file.path, reference, line: decl.source?.start?.line, column: decl.source?.start?.column ? decl.source.start.column - 1 : 0 });
        return false;
      });
    });
  } catch (error) {
    const position = errorPosition(error);
    add({ code: "GAME_SDK_PACKAGE_ASSET_PARSE_ERROR", file: file.path, ...position, reference: "", hint: "Fix the CSS parse error before saving." });
  }
}

function sourceFilePath(path: string) {
  return SOURCE_EXTENSIONS.has(extension(path));
}

function sortFindings<T extends { file: string; line: number; column: number; code: string; reference: string }>(findings: T[]) {
  findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column || left.code.localeCompare(right.code) || left.reference.localeCompare(right.reference));
}

export function auditGamePackageAssets(files: readonly PackageAssetFile[]): GamePackageAssetAudit {
  const findings: GamePackageAssetFinding[] = [];
  const add: FindingSink = (finding) => findings.push(finding as GamePackageAssetFinding);
  const exactPaths = new Set(files.map((file) => file.path));
  const foldedPaths = new Map<string, string[]>();
  for (const path of exactPaths) foldedPaths.set(path.toLowerCase(), [...(foldedPaths.get(path.toLowerCase()) ?? []), path].sort());
  const byPath = new Map(files.map((file) => [file.path, file]));
  const queued = [packageManifestRoles(files).clientEntry];
  const visited = new Set<string>();
  const observeReference: ReferenceObserver = (input) => {
    const reference = input.reference.trim();
    if (ignoredReference(reference)) return;
    const resolved = normalizeGamePackageAssetReference(input.parent, reference);
    if (!resolved || resolved.outside || !exactPaths.has(resolved.path)) return;
    if (sourceFilePath(resolved.path) && isBrowserReadableGamePackageAsset(resolved.path)) queued.push(resolved.path);
  };
  while (queued.length > 0) {
    const path = queued.shift()!;
    if (visited.has(path)) continue;
    visited.add(path);
    const file = byPath.get(path);
    if (!file || !SOURCE_EXTENSIONS.has(extension(file.path))) continue;
    if (file.encoding !== "utf-8" || file.content.includes("\0")) {
      add({ code: "GAME_SDK_PACKAGE_ASSET_ENCODING_INVALID", file: file.path, line: 1, column: 1, reference: "", hint: "Source files must be valid UTF-8 text." });
      continue;
    }
    if ([".html", ".htm"].includes(extension(file.path))) inspectHtml(file, exactPaths, foldedPaths, add, observeReference);
    else if (extension(file.path) === ".css") inspectCss(file, exactPaths, foldedPaths, add, observeReference);
    else inspectJavaScript(file, exactPaths, foldedPaths, add, { observeReference });
  }
  sortFindings(findings);
  return { valid: findings.length === 0, findings };
}

function serverSourceCandidates(path: string) {
  const currentExtension = extension(path);
  if ([".js", ".mjs", ".cjs", ".jsx"].includes(currentExtension)) {
    const stem = path.slice(0, -currentExtension.length);
    return [path, `${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${stem}.cts`];
  }
  if (!currentExtension) return [path, `${path}.ts`, `${path}.tsx`, `${path}.js`];
  return [path];
}

function serverSourceDynamicFinding(file: string, node: t.Node, reference: string, add: FindingSink) {
  const position = sourcePosition(node.loc?.start.line, node.loc?.start.column);
  add({
    code: "GAME_SDK_PACKAGE_SERVER_SOURCE_DYNAMIC_REFERENCE",
    file,
    ...position,
    reference,
    hint: "Replace the dynamic server source import or asset reference with a statically resolvable source-relative path.",
  });
}

export function auditGamePackageServerSource(files: readonly PackageAssetFile[]): GamePackageServerAudit {
  const findings: GamePackageServerFinding[] = [];
  const add: FindingSink = (finding) => findings.push(finding as GamePackageServerFinding);
  const exactPaths = new Set(files.map((file) => file.path));
  const foldedPaths = new Map<string, string[]>();
  for (const path of exactPaths) foldedPaths.set(path.toLowerCase(), [...(foldedPaths.get(path.toLowerCase()) ?? []), path].sort());
  const roles = packageManifestRoles(files);
  const byPath = new Map(files.map((file) => [file.path, file]));

  const serverEntry = byPath.get(roles.serverEntry);
  if (!serverEntry) {
    findings.push({ code: "GAME_SDK_PACKAGE_SERVER_ENTRY_MISSING", file: roles.serverEntry, line: 1, column: 1, reference: roles.serverEntry, hint: `Add the server entry declared by server.entry: ${roles.serverEntry}` });
  } else if (serverEntry.encoding !== "utf-8" || serverEntry.content.includes("\0")) {
    findings.push({ code: "GAME_SDK_PACKAGE_SERVER_ENTRY_ENCODING_INVALID", file: serverEntry.path, line: 1, column: 1, reference: "", hint: "The server entry must be valid UTF-8 text." });
  } else if (SERVER_SOURCE_EXTENSIONS.has(extension(serverEntry.path))) {
    inspectJavaScript(serverEntry, exactPaths, foldedPaths, add, {
      inspectReference: () => undefined,
      dynamicFinding: () => undefined,
      parseFinding: (file, error, sink) => {
        const position = errorPosition(error);
        sink({ code: "GAME_SDK_PACKAGE_SERVER_ENTRY_PARSE_ERROR", file: file.path, ...position, reference: "", hint: "Fix the server bundle parse error before saving." });
      },
    });
  }

  const appSetSource = byPath.get(roles.appSetSource);
  if (!appSetSource) {
    findings.push({ code: "GAME_SDK_PACKAGE_SERVER_SOURCE_MISSING", file: roles.appSetSource, line: 1, column: 1, reference: roles.appSetSource, hint: `Add the server source declared by server.appSetSource: ${roles.appSetSource}` });
  }

  const inspectServerReference = (input: ReferenceInput) => {
    const reference = input.reference.trim();
    if (ignoredReference(reference) || !(reference.startsWith("./") || reference.startsWith("../") || reference.startsWith("/"))) return;
    const position = sourcePosition(input.line, input.column);
    const resolved = normalizeGamePackageAssetReference(input.parent, reference);
    if (!resolved || resolved.outside || !resolved.path.startsWith("source/")) {
      findings.push({ code: "GAME_SDK_PACKAGE_SERVER_SOURCE_OUTSIDE_ROOT", file: input.parent, ...position, reference, hint: "Keep server source imports inside the package source/ tree." });
      return;
    }
    const candidates = serverSourceCandidates(resolved.path);
    const target = candidates.find((candidate) => exactPaths.has(candidate));
    if (target) return;
    const alternatives = candidates.flatMap((candidate) => foldedPaths.get(candidate.toLowerCase()) ?? []);
    findings.push({
      code: alternatives.length > 0 ? "GAME_SDK_PACKAGE_SERVER_SOURCE_CASE_MISMATCH" : "GAME_SDK_PACKAGE_SERVER_SOURCE_MISSING",
      file: input.parent,
      ...position,
      reference,
      hint: alternatives.length > 0 ? `Use the exact source path casing: ${alternatives[0]}` : `Add the referenced server source: ${candidates[0]}`,
    });
  };

  for (const file of [...files].sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)))) {
    if (!file.path.startsWith("source/") || !SERVER_SOURCE_EXTENSIONS.has(extension(file.path))) continue;
    if (file.encoding !== "utf-8" || file.content.includes("\0")) {
      findings.push({ code: "GAME_SDK_PACKAGE_SERVER_SOURCE_ENCODING_INVALID", file: file.path, line: 1, column: 1, reference: "", hint: "Server source files must be valid UTF-8 text." });
      continue;
    }
    inspectJavaScript(file, exactPaths, foldedPaths, add, {
      inspectReference: inspectServerReference,
      dynamicFinding: serverSourceDynamicFinding,
      parseFinding: (parsedFile, error, sink) => {
        const position = errorPosition(error);
        sink({ code: "GAME_SDK_PACKAGE_SERVER_SOURCE_PARSE_ERROR", file: parsedFile.path, ...position, reference: "", hint: "Fix the server source parse error before saving." });
      },
    });
  }

  sortFindings(findings);
  return { valid: findings.length === 0, findings };
}

export function auditGamePackage(files: readonly PackageAssetFile[]): GamePackageAudit {
  const client = auditGamePackageAssets(files);
  const server = auditGamePackageServerSource(files);
  const findings: GamePackageFinding[] = [...client.findings, ...server.findings];
  sortFindings(findings);
  return { valid: findings.length === 0, findings };
}

export class GamePackageAssetValidationError extends Error {
  readonly findings: readonly GamePackageFinding[];

  constructor(findings: readonly GamePackageFinding[]) {
    super(findings[0]?.code ?? "GAME_SDK_PACKAGE_ASSET_INVALID");
    this.name = "GamePackageAssetValidationError";
    this.findings = findings;
  }
}

export function assertGamePackageAssets(files: readonly PackageAssetFile[]) {
  const audit = auditGamePackage(files);
  if (!audit.valid) throw new GamePackageAssetValidationError(audit.findings);
  return audit;
}
