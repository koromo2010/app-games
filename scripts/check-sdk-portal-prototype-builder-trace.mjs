import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const fixtureRoot = path.resolve(repoRoot, "tests/fixtures/t114-publish-mock-v003");
const modeArgument = process.argv.find((arg) => arg.startsWith("--mode="));
const mode = modeArgument?.slice("--mode=".length) ?? "positive";
if (!["positive", "missing-game-sdk", "missing-esbuild-binary"].includes(mode)) {
  throw new Error("PROTOTYPE_TRACE_MODE_INVALID");
}

const routeRelative = "apps/sdk-portal/.next/server/app/api/mcp/route.js";
const traceRelative = `${routeRelative}.nft.json`;
const routePath = path.join(repoRoot, routeRelative);
const tracePath = path.join(repoRoot, traceRelative);
if (!existsSync(routePath) || !existsSync(tracePath)) {
  throw new Error("SDK_PORTAL_MCP_TRACE_REQUIRED");
}

const traceDirectory = path.dirname(tracePath);
const trace = JSON.parse(readFileSync(tracePath, "utf8"));
const tracedLexicalPaths = trace.files.map((relativePath) =>
  path.resolve(traceDirectory, relativePath)
);

function hasSuffix(suffix) {
  return tracedLexicalPaths.some((file) => file.endsWith(suffix));
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const inventory = {
  esbuildPackage: hasSuffix("/node_modules/esbuild/package.json"),
  esbuildPlatformBinary: tracedLexicalPaths.some((file) =>
    /\/node_modules\/@esbuild\/[^/]+\/bin\/esbuild$/.test(file)
  ),
  gameSdkPackage: hasSuffix("/packages/game-sdk/package.json"),
  gameSdkIndex: hasSuffix("/packages/game-sdk/dist/index.js"),
  gameSdkModules: hasSuffix("/packages/game-sdk/dist/modules.js"),
  gameSdkPortableServer: hasSuffix("/packages/game-sdk/dist/portable-server.js"),
  reactPackage: hasSuffix("/node_modules/react/package.json"),
  reactJsxRuntime: hasSuffix("/node_modules/react/jsx-runtime.js"),
  reactDomClient: hasSuffix("/node_modules/react-dom/client.js"),
  schedulerPackage: hasSuffix("/node_modules/scheduler/package.json"),
};
if (Object.values(inventory).some((present) => !present)) {
  throw new Error("SDK_PORTAL_MCP_TRACE_INCOMPLETE");
}

const sandbox = mkdtempSync(path.join(tmpdir(), "game-fields-prototype-trace-"));
const previousCwd = process.cwd();
const previousNodePath = process.env.NODE_PATH;

function shouldSkip(source) {
  if (mode === "missing-game-sdk" && source.includes("/packages/game-sdk/")) return true;
  return mode === "missing-esbuild-binary"
    && /\/node_modules\/@esbuild\/[^/]+\/bin\/esbuild$/.test(source);
}

function copyTracedPath(source) {
  const relative = path.relative(repoRoot, source);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("SDK_PORTAL_TRACE_PATH_ESCAPE");
  }
  const resolved = realpathSync(source);
  const resolvedRelative = path.relative(repoRoot, resolved);
  if (resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative)) {
    throw new Error("SDK_PORTAL_TRACE_SOURCE_ESCAPE");
  }
  if (shouldSkip(source)) return;
  cpSync(source, path.join(sandbox, relative), {
    recursive: statSync(source).isDirectory(),
    dereference: true,
  });
}

function fixtureInput() {
  const publishInput = JSON.parse(readFileSync(path.join(fixtureRoot, "publish-input.json"), "utf8"));
  const profile = JSON.parse(readFileSync(path.join(fixtureRoot, publishInput.profileBindingPath), "utf8"));
  return {
    gameId: publishInput.gameId,
    manifest: JSON.parse(readFileSync(path.join(fixtureRoot, publishInput.manifestPath), "utf8")),
    files: Object.fromEntries(Object.entries(publishInput.files).map(([key, relativePath]) => [
      key,
      readFileSync(path.join(fixtureRoot, relativePath), "utf8"),
    ])),
    moduleBinding: {
      environment: profile.environment,
      moduleProfileRevision: profile.moduleProfileRevision,
      moduleContractDigest: profile.moduleContractDigest,
      sdkPackageVersion: profile.sdkPackageVersion,
      sdkContractVersion: profile.sdkContractVersion,
    },
  };
}

function builderModuleId(routeSource) {
  const chunkNames = [...routeSource.matchAll(/R\.c\("([^"]+)"\)/g)].map((match) => match[1]);
  for (const chunkName of chunkNames) {
    const chunkPath = path.join(sandbox, "apps/sdk-portal/.next", chunkName);
    if (!existsSync(chunkPath)) continue;
    const source = readFileSync(chunkPath, "utf8");
    const markerIndex = source.indexOf("GAME_FIELDS_NODE_FREE_BUILDER_MODULE_V1");
    if (markerIndex < 0) continue;
    const moduleStarts = [...source.slice(0, markerIndex).matchAll(/\},(\d+),[A-Za-z_$][\w$]*=>/g)];
    const moduleId = Number(moduleStarts.at(-1)?.[1]);
    if (Number.isSafeInteger(moduleId)) return { chunkNames, moduleId };
  }
  throw new Error("COMPILED_PROTOTYPE_BUILDER_MODULE_NOT_FOUND");
}

let result;
try {
  for (const source of tracedLexicalPaths) copyTracedPath(source);
  copyTracedPath(routePath);
  copyTracedPath(tracePath);
  delete process.env.NODE_PATH;
  process.chdir(sandbox);

  const routeSource = readFileSync(path.join(sandbox, routeRelative), "utf8");
  const { chunkNames, moduleId } = builderModuleId(routeSource);
  const runtimePath = path.join(sandbox, "apps/sdk-portal/.next/server/chunks/[turbopack]_runtime.js");
  const runtime = require(runtimePath)("server/app/api/mcp/prototype-trace-diagnostic.js");
  for (const chunkName of chunkNames) runtime.c(chunkName);
  const builder = await runtime.m(moduleId).exports;
  if (
    typeof builder.buildNodeFreeGamePackage !== "function"
    || typeof builder.probePrototypeBuilderRuntime !== "function"
    || !/^[a-f0-9]{64}$/.test(builder.PROTOTYPE_BUILDER_IDENTITY ?? "")
  ) {
    throw new Error("COMPILED_PROTOTYPE_BUILDER_IDENTITY_MISMATCH");
  }

  try {
    const probe = await builder.probePrototypeBuilderRuntime();
    if (mode !== "positive") throw new Error("NEGATIVE_TRACE_PROBE_UNEXPECTEDLY_PASSED");
    const built = await builder.buildNodeFreeGamePackage(fixtureInput());
    const reactDomInput = fixtureInput();
    reactDomInput.files["source/game-client.tsx"] = [
      'import { createRoot } from "react-dom/client";',
      "void createRoot;",
      reactDomInput.files["source/game-client.tsx"],
    ].join("\n");
    await builder.buildNodeFreeGamePackage(reactDomInput);
    const expected = JSON.parse(readFileSync(path.join(fixtureRoot, "fixture-manifest.json"), "utf8"));
    const paths = built.map((file) => file.path).sort();
    if (JSON.stringify(paths) !== JSON.stringify(expected.expectedBuildArtifacts)) {
      throw new Error("TRACE_FIXTURE_ARTIFACT_SET_MISMATCH");
    }
    result = {
      mode,
      routeTrace: "PASS",
      runtimeDependencyProbe: "PASS",
      compiledFixtureBuild: "PASS",
      reactDomDependencyClosure: "PASS",
      runtimeContractVersion: probe.runtimeContractVersion,
      builderIdentity: probe.builderIdentity,
      traceFileCount: trace.files.length,
      inventory,
      versions: {
        esbuild: JSON.parse(readFileSync(path.join(repoRoot, "node_modules/esbuild/package.json"), "utf8")).version,
        gameSdk: JSON.parse(readFileSync(path.join(repoRoot, "packages/game-sdk/package.json"), "utf8")).version,
        react: JSON.parse(readFileSync(path.join(repoRoot, "node_modules/react/package.json"), "utf8")).version,
        reactDom: JSON.parse(readFileSync(path.join(repoRoot, "node_modules/react-dom/package.json"), "utf8")).version,
      },
      contentHashes: {
        gameSdkIndex: sha256(path.join(repoRoot, "packages/game-sdk/dist/index.js")),
        gameSdkModules: sha256(path.join(repoRoot, "packages/game-sdk/dist/modules.js")),
        gameSdkPortableServer: sha256(path.join(repoRoot, "packages/game-sdk/dist/portable-server.js")),
      },
    };
  } catch (error) {
    const expectedCode = mode === "missing-game-sdk"
      ? "DEPENDENCY_UNAVAILABLE"
      : mode === "missing-esbuild-binary"
        ? "ESBUILD_UNAVAILABLE"
        : null;
    if (!expectedCode || error?.code !== expectedCode) throw error;
    result = {
      mode,
      routeTrace: "PASS",
      negativeProbe: "PASS",
      buildFailureCode: error.code,
      buildStage: error.stage,
      dependencyClass: error.dependencyClass,
    };
  }
} finally {
  process.chdir(previousCwd);
  if (previousNodePath === undefined) delete process.env.NODE_PATH;
  else process.env.NODE_PATH = previousNodePath;
  rmSync(sandbox, { recursive: true, force: true });
}

console.log(JSON.stringify(result, null, 2));
