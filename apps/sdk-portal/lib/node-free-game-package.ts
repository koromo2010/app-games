import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { build, version as esbuildVersion, type Plugin } from "esbuild";
import {
  assertGameManifest,
  type GameSdkManifest,
} from "@game-fields/game-sdk";
import { validateGameSdkMockQuality } from "@game-fields/game-sdk/mock-quality";
import type { GameSdkModuleBinding } from "@game-fields/game-sdk/module-usage";
import platformRelease from "../../../config/platform-release.json" with { type: "json" };
import {
  prepareGamePackageUploadFiles,
  type PreparedUploadFile,
} from "./mock-git-store.ts";
import { sharedGameSourceSha256 } from "./module-authoring-contract.ts";
import {
  createPrototypeBuilderIdentity,
  PROTOTYPE_BUILDER_RUNTIME_CONTRACT_VERSION,
  PrototypeBuildError,
  type PrototypeBuildDependencyClass,
  type PrototypeBuildStage,
} from "./prototype-builder-diagnostics.ts";

const MAX_SOURCE_FILE_BYTES = 256 * 1024;
const ALLOWED_SDK_IMPORT_IDS = [
  "@game-fields/game-sdk",
  "@game-fields/game-sdk/content-source",
  "@game-fields/game-sdk/drawing",
  "@game-fields/game-sdk/drawing-react",
  "@game-fields/game-sdk/llm",
  "@game-fields/game-sdk/modules",
  "@game-fields/game-sdk/playing-cards",
  "@game-fields/game-sdk/playing-cards-react",
  "@game-fields/game-sdk/portable-server",
  "@game-fields/game-sdk/resources",
  "@game-fields/game-sdk/runtime",
] as const;
const ALLOWED_UI_IMPORT_IDS = ["react", "react/jsx-runtime", "react-dom/client"] as const;
const ALLOWED_SDK_IMPORTS = new Set<string>(ALLOWED_SDK_IMPORT_IDS);
const ALLOWED_UI_IMPORTS = new Set<string>(ALLOWED_UI_IMPORT_IDS);
function runtimeRepositoryRoot() {
  const roots = [
    process.env.LAMBDA_TASK_ROOT,
    process.cwd(),
    path.resolve(process.cwd(), "../.."),
  ].filter((root): root is string => Boolean(root));
  const resolved = roots.find((root) =>
    existsSync(path.join(root, "node_modules/esbuild/package.json"))
  );
  if (!resolved) {
    throw new PrototypeBuildError({
      code: "DEPENDENCY_UNAVAILABLE",
      stage: "dependency-resolution",
      dependencyClass: "unknown",
    });
  }
  return resolved;
}

function runtimeDependencyPath(relativePath: string) {
  return path.join(runtimeRepositoryRoot(), relativePath);
}

const RUNTIME_DEPENDENCY_RESOLVERS: Record<string, () => string> = {
  "@game-fields/game-sdk": () => runtimeDependencyPath("packages/game-sdk/dist/index.js"),
  "@game-fields/game-sdk/content-source": () => runtimeDependencyPath("packages/game-sdk/dist/content-source.js"),
  "@game-fields/game-sdk/drawing": () => runtimeDependencyPath("packages/game-sdk/dist/drawing.js"),
  "@game-fields/game-sdk/drawing-react": () => runtimeDependencyPath("packages/game-sdk/dist/drawing-react.js"),
  "@game-fields/game-sdk/llm": () => runtimeDependencyPath("packages/game-sdk/dist/llm.js"),
  "@game-fields/game-sdk/modules": () => runtimeDependencyPath("packages/game-sdk/dist/modules.js"),
  "@game-fields/game-sdk/playing-cards": () => runtimeDependencyPath("packages/game-sdk/dist/playing-cards.js"),
  "@game-fields/game-sdk/playing-cards-react": () => runtimeDependencyPath("packages/game-sdk/dist/playing-cards-react.js"),
  "@game-fields/game-sdk/portable-server": () => runtimeDependencyPath("packages/game-sdk/dist/portable-server.js"),
  "@game-fields/game-sdk/resources": () => runtimeDependencyPath("packages/game-sdk/dist/resources.js"),
  "@game-fields/game-sdk/runtime": () => runtimeDependencyPath("packages/game-sdk/dist/runtime.js"),
  react: () => runtimeDependencyPath("node_modules/react/index.js"),
  "react/jsx-runtime": () => runtimeDependencyPath("node_modules/react/jsx-runtime.js"),
  "react-dom/client": () => runtimeDependencyPath("node_modules/react-dom/client.js"),
};
const REQUIRED_SOURCE_FILES = [
  "source/app-set.ts",
  "source/contracts.ts",
  "source/manifest.ts",
  "source/server-module.ts",
  "source/game-client.tsx",
  "source/prototype-adapter.ts",
] as const;
const REQUIRED_MOCK_FILES = [
  "index.html",
  "styles.css",
  "mock.js",
  "preview.json",
] as const;

export const PROTOTYPE_BUILDER_MODULE_MARKER = "GAME_FIELDS_NODE_FREE_BUILDER_MODULE_V1";
export const PROTOTYPE_BUILDER_IDENTITY = createPrototypeBuilderIdentity({
  sdkPackageVersion: platformRelease.sdkPackageVersion,
  esbuildVersion,
  allowedImports: [...ALLOWED_SDK_IMPORT_IDS, ...ALLOWED_UI_IMPORT_IDS],
  moduleMarker: PROTOTYPE_BUILDER_MODULE_MARKER,
});

function dependencyClassFor(importId: string): PrototypeBuildDependencyClass {
  if (importId.startsWith("@game-fields/game-sdk")) return "game-sdk";
  if (importId === "react-dom/client") return "react-dom";
  if (importId.startsWith("react")) return "react";
  return "unknown";
}

function resolveRuntimeDependency(importId: string) {
  const resolver = RUNTIME_DEPENDENCY_RESOLVERS[importId];
  if (!resolver) {
    throw new PrototypeBuildError({
      code: "IMPORT_FORBIDDEN",
      stage: "dependency-resolution",
    });
  }
  try {
    const resolved = resolver();
    if (!existsSync(resolved)) {
      throw new Error("PROTOTYPE_BUILDER_DEPENDENCY_MISSING");
    }
    return resolved;
  } catch {
    throw new PrototypeBuildError({
      code: "DEPENDENCY_UNAVAILABLE",
      stage: "dependency-resolution",
      dependencyClass: dependencyClassFor(importId),
    });
  }
}

function nestedPrototypeBuildError(error: unknown): PrototypeBuildError | null {
  if (error instanceof PrototypeBuildError) return error;
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    cause?: unknown;
    errors?: Array<{ detail?: unknown }>;
  };
  const cause = nestedPrototypeBuildError(candidate.cause);
  if (cause) return cause;
  for (const item of candidate.errors ?? []) {
    const detail = nestedPrototypeBuildError(item.detail);
    if (detail) return detail;
  }
  return null;
}

function classifyEsbuildFailure(error: unknown, stage: PrototypeBuildStage) {
  const nested = nestedPrototypeBuildError(error);
  if (nested) return nested;
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("The service was stopped")
    || message.includes("Cannot start service")
    || message.includes("esbuild binary")
    || message.includes("@esbuild/")
  ) {
    return new PrototypeBuildError({
      code: "ESBUILD_UNAVAILABLE",
      stage,
      dependencyClass: "esbuild",
    });
  }
  return new PrototypeBuildError({ code: "ESBUILD_COMPILE_FAILED", stage });
}

let runtimeProbePromise: Promise<{
  prototypeBuilder: "ready";
  runtimeContractVersion: typeof PROTOTYPE_BUILDER_RUNTIME_CONTRACT_VERSION;
  builderIdentity: string;
}> | null = null;

export function probePrototypeBuilderRuntime() {
  runtimeProbePromise ??= (async () => {
    for (const importId of [...ALLOWED_SDK_IMPORT_IDS, ...ALLOWED_UI_IMPORT_IDS]) {
      resolveRuntimeDependency(importId);
    }
    try {
      await build({
        bundle: true,
        format: "esm",
        logLevel: "silent",
        platform: "node",
        stdin: { contents: "export const prototypeBuilderProbe = true;", loader: "js" },
        write: false,
      });
    } catch (error) {
      throw classifyEsbuildFailure(error, "dependency-resolution");
    }
    return {
      prototypeBuilder: "ready" as const,
      runtimeContractVersion: PROTOTYPE_BUILDER_RUNTIME_CONTRACT_VERSION,
      builderIdentity: PROTOTYPE_BUILDER_IDENTITY,
    };
  })();
  return runtimeProbePromise;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function creatorSourcePlugin(
  files: Readonly<Record<string, string>>,
  entryContents: string,
): Plugin {
  return {
    name: "game-fields-creator-source",
    setup(builder) {
      builder.onResolve({ filter: /^creator-entry$/ }, () => ({
        path: "creator-entry.ts",
        namespace: "creator-source",
      }));
      builder.onResolve({ filter: /^\.\.?\//, namespace: "creator-source" }, (args) => {
        const importerDirectory = path.posix.dirname(args.importer);
        const requested = path.posix.normalize(path.posix.join(importerDirectory, args.path));
        if (requested.startsWith("../") || requested === "..") {
          throw new PrototypeBuildError({
            code: "IMPORT_FORBIDDEN",
            stage: "dependency-resolution",
          });
        }
        const candidates = [
          requested,
          requested.replace(/\.js$/, ".ts"),
          requested.replace(/\.js$/, ".tsx"),
          `${requested}.ts`,
          `${requested}.tsx`,
        ];
        const resolved = candidates.find((candidate) => Object.hasOwn(files, candidate));
        if (!resolved) {
          throw new PrototypeBuildError({
            code: "SOURCE_NOT_FOUND",
            stage: "dependency-resolution",
          });
        }
        return { path: resolved, namespace: "creator-source" };
      });
      builder.onResolve({ filter: /^@game-fields\/game-sdk(?:\/.*)?$/ }, (args) => {
        if (!ALLOWED_SDK_IMPORTS.has(args.path)) {
          throw new PrototypeBuildError({
            code: "IMPORT_FORBIDDEN",
            stage: "dependency-resolution",
          });
        }
        return { path: resolveRuntimeDependency(args.path) };
      });
      builder.onResolve({ filter: /^(?:react(?:\/jsx-runtime)?|react-dom\/client)$/ }, (args) => {
        if (!ALLOWED_UI_IMPORTS.has(args.path)) {
          throw new PrototypeBuildError({
            code: "IMPORT_FORBIDDEN",
            stage: "dependency-resolution",
          });
        }
        return { path: resolveRuntimeDependency(args.path) };
      });
      builder.onResolve({ filter: /.*/, namespace: "creator-source" }, (args) => {
        void args;
        throw new PrototypeBuildError({
          code: "IMPORT_FORBIDDEN",
          stage: "dependency-resolution",
        });
      });
      builder.onLoad({ filter: /.*/, namespace: "creator-source" }, (args) => {
        if (args.path === "creator-entry.ts") {
          return {
            loader: "ts",
            contents: entryContents,
          };
        }
        return { loader: args.path.endsWith(".tsx") ? "tsx" : "ts", contents: files[args.path] };
      });
    },
  };
}

function assertSourceFiles(files: Readonly<Record<string, string>>) {
  for (const required of REQUIRED_SOURCE_FILES) {
    const source = files[required];
    if (typeof source !== "string" || !source.trim()) {
      throw new PrototypeBuildError({
        code: "REQUIRED_SOURCE_MISSING",
        stage: "input-validation",
      });
    }
    if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_FILE_BYTES) {
      throw new PrototypeBuildError({
        code: "SOURCE_TOO_LARGE",
        stage: "input-validation",
      });
    }
  }
}

export async function buildNodeFreeGamePackage(input: {
  gameId: string;
  manifest: unknown;
  files: Readonly<Record<string, string>>;
  moduleBinding: GameSdkModuleBinding;
  prototypeRevision?: string;
}): Promise<PreparedUploadFile[] & { prototypeFiles: Record<string, string> }> {
  const manifest = input.manifest as GameSdkManifest;
  try {
    assertGameManifest(manifest);
  } catch {
    throw new PrototypeBuildError({
      code: "MANIFEST_INVALID",
      stage: "input-validation",
    });
  }
  if (manifest.id !== input.gameId) {
    throw new PrototypeBuildError({
      code: "MANIFEST_ID_MISMATCH",
      stage: "input-validation",
    });
  }
  assertSourceFiles(input.files);
  const mockFiles = Object.fromEntries(
    REQUIRED_MOCK_FILES.map((file) => [file, input.files[file]]),
  ) as Record<string, string>;
  let quality: ReturnType<typeof validateGameSdkMockQuality>;
  try {
    quality = validateGameSdkMockQuality({ files: mockFiles });
  } catch {
    throw new PrototypeBuildError({
      code: "MOCK_QUALITY_INVALID",
      stage: "mock-validation",
    });
  }
  if (quality.gameId !== input.gameId) {
    throw new PrototypeBuildError({
      code: "MOCK_QUALITY_INVALID",
      stage: "mock-validation",
    });
  }

  const buildCreatorBundle = async (
    stage: "server-bundle" | "formal-client-bundle" | "prototype-bundle",
    entryContents: string,
  ) => {
    try {
      return await build({
      bundle: true,
      entryPoints: ["creator-entry"],
      format: "iife",
      jsx: "automatic",
      legalComments: "none",
      logLevel: "silent",
      minify: true,
      platform: "browser",
      plugins: [creatorSourcePlugin(input.files, entryContents)],
      target: "es2022",
      write: false,
      });
    } catch (error) {
      throw classifyEsbuildFailure(error, stage);
    }
  };
  const [serverOutput, formalClientOutput, prototypeOutput] = await Promise.all([
      buildCreatorBundle("server-bundle", [
        'import { installGameSdkPortableServer } from "@game-fields/game-sdk/portable-server";',
        'import * as serverExports from "./source/server-module.js";',
        "const serverModule = Object.values(serverExports).find((value) => value && typeof value === 'object' && 'manifest' in value && typeof value.createRoom === 'function' && typeof value.applyCommand === 'function' && typeof value.presentRoom === 'function');",
        "if (!serverModule) throw new Error('GAME_SDK_PACKAGE_SERVER_MODULE_NOT_FOUND');",
        "installGameSdkPortableServer(serverModule);",
      ].join("\n")),
      buildCreatorBundle("formal-client-bundle", [
        'import { mountGameClient } from "./source/game-client.js";',
        "const room = globalThis.GameFieldsRoom;",
        "if (!room) throw new Error('GAME_FIELDS_ROOM_REQUIRED');",
        "mountGameClient({ subscribe: room.subscribe.bind(room), send: room.send.bind(room), mode: 'formal-room' });",
      ].join("\n")),
      buildCreatorBundle("prototype-bundle", [
        'import { mountGameClient } from "./source/game-client.js";',
        'import { createPrototypeAdapter } from "./source/prototype-adapter.js";',
        "mountGameClient(createPrototypeAdapter());",
      ].join("\n")),
    ]);
  const bundle = serverOutput.outputFiles[0]?.text ?? "";
  const formalClientBundle = formalClientOutput.outputFiles[0]?.text ?? "";
  const prototypeBundle = prototypeOutput.outputFiles[0]?.text ?? "";
  if (!bundle || !formalClientBundle || !prototypeBundle) {
    throw new PrototypeBuildError({
      code: "BUNDLE_EMPTY",
      stage: "output-validation",
    });
  }
  if ([bundle, formalClientBundle, prototypeBundle]
    .some((output) => Buffer.byteLength(output, "utf8") > 1024 * 1024)) {
    throw new PrototypeBuildError({
      code: "BUNDLE_TOO_LARGE",
      stage: "output-validation",
    });
  }

  const packageManifest = {
    schemaVersion: 1,
    gameId: input.gameId,
    sdkPackageVersion: platformRelease.sdkPackageVersion,
    sdkContractVersion: platformRelease.sdkContractVersion,
    authoring: {
      environment: input.moduleBinding.environment,
      moduleProfileRevision: input.moduleBinding.moduleProfileRevision,
      moduleContractDigest: input.moduleBinding.moduleContractDigest,
      sharedSourceSha256: sharedGameSourceSha256(input.files),
      ...(input.prototypeRevision ? { prototypeRevision: input.prototypeRevision } : {}),
    },
    manifest,
    client: { entry: "index.html" },
    server: {
      entry: "server.bundle.js",
      bundleSha256: sha256(bundle),
      appSetSource: "source/app-set.ts",
      appSetSourceSha256: sha256(input.files["source/app-set.ts"]),
    },
  };
  const packageFiles = [
    ...REQUIRED_MOCK_FILES.map((file) => ({
      path: file,
      content: file === "mock.js" ? formalClientBundle : input.files[file],
      encoding: "utf-8" as const,
    })),
    ...REQUIRED_SOURCE_FILES.map((file) => ({
      path: file,
      content: input.files[file],
      encoding: "utf-8" as const,
    })),
    { path: "server.bundle.js", content: bundle, encoding: "utf-8" as const },
    {
      path: "game-fields-package.json",
      content: `${JSON.stringify(packageManifest, null, 2)}\n`,
      encoding: "utf-8" as const,
    },
  ];
  const formalPackageFiles = prepareGamePackageUploadFiles(packageFiles);
  return Object.assign(formalPackageFiles, {
    prototypeFiles: {
      ...input.files,
      "mock.js": prototypeBundle,
    } as Record<string, string>,
  });
}
