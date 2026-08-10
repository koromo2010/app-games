import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { build, type Plugin } from "esbuild";
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

const require = createRequire(import.meta.url);
const MAX_SOURCE_FILE_BYTES = 256 * 1024;
const ALLOWED_SDK_IMPORTS = new Set([
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
]);
const ALLOWED_UI_IMPORTS = new Set(["react", "react/jsx-runtime", "react-dom/client"]);
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
          throw new Error("GAME_SDK_NODE_FREE_IMPORT_FORBIDDEN");
        }
        const candidates = [
          requested,
          requested.replace(/\.js$/, ".ts"),
          requested.replace(/\.js$/, ".tsx"),
          `${requested}.ts`,
          `${requested}.tsx`,
        ];
        const resolved = candidates.find((candidate) => Object.hasOwn(files, candidate));
        if (!resolved) throw new Error(`GAME_SDK_NODE_FREE_SOURCE_NOT_FOUND:${requested}`);
        return { path: resolved, namespace: "creator-source" };
      });
      builder.onResolve({ filter: /^@game-fields\/game-sdk(?:\/.*)?$/ }, (args) => {
        if (!ALLOWED_SDK_IMPORTS.has(args.path)) {
          throw new Error(`GAME_SDK_NODE_FREE_IMPORT_FORBIDDEN:${args.path}`);
        }
        return { path: require.resolve(args.path) };
      });
      builder.onResolve({ filter: /^(?:react(?:\/jsx-runtime)?|react-dom\/client)$/ }, (args) => {
        if (!ALLOWED_UI_IMPORTS.has(args.path)) {
          throw new Error(`GAME_SDK_NODE_FREE_IMPORT_FORBIDDEN:${args.path}`);
        }
        return { path: require.resolve(args.path) };
      });
      builder.onResolve({ filter: /.*/, namespace: "creator-source" }, (args) => {
        throw new Error(`GAME_SDK_NODE_FREE_IMPORT_FORBIDDEN:${args.path}`);
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
      throw new Error(`GAME_SDK_NODE_FREE_SOURCE_REQUIRED:${required}`);
    }
    if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_FILE_BYTES) {
      throw new Error(`GAME_SDK_NODE_FREE_SOURCE_TOO_LARGE:${required}`);
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
  assertGameManifest(manifest);
  if (manifest.id !== input.gameId) {
    throw new Error("GAME_SDK_NODE_FREE_MANIFEST_ID_MISMATCH");
  }
  assertSourceFiles(input.files);
  const mockFiles = Object.fromEntries(
    REQUIRED_MOCK_FILES.map((file) => [file, input.files[file]]),
  ) as Record<string, string>;
  const quality = validateGameSdkMockQuality({ files: mockFiles });
  if (quality.gameId !== input.gameId) {
    throw new Error("GAME_SDK_NODE_FREE_PREVIEW_ID_MISMATCH");
  }

  let bundle: string;
  let formalClientBundle: string;
  let prototypeBundle: string;
  try {
    const buildCreatorBundle = async (entryContents: string) => build({
      bundle: true,
      entryPoints: ["creator-entry"],
      format: "iife",
      jsx: "automatic",
      legalComments: "none",
      minify: true,
      platform: "browser",
      plugins: [creatorSourcePlugin(input.files, entryContents)],
      target: "es2022",
      write: false,
    });
    const [serverOutput, formalClientOutput, prototypeOutput] = await Promise.all([
      buildCreatorBundle([
        'import { installGameSdkPortableServer } from "@game-fields/game-sdk/portable-server";',
        'import * as serverExports from "./source/server-module.js";',
        "const serverModule = Object.values(serverExports).find((value) => value && typeof value === 'object' && 'manifest' in value && typeof value.createRoom === 'function' && typeof value.applyCommand === 'function' && typeof value.presentRoom === 'function');",
        "if (!serverModule) throw new Error('GAME_SDK_PACKAGE_SERVER_MODULE_NOT_FOUND');",
        "installGameSdkPortableServer(serverModule);",
      ].join("\n")),
      buildCreatorBundle([
        'import { mountGameClient } from "./source/game-client.js";',
        "const room = globalThis.GameFieldsRoom;",
        "if (!room) throw new Error('GAME_FIELDS_ROOM_REQUIRED');",
        "mountGameClient({ subscribe: room.subscribe.bind(room), send: room.send.bind(room), mode: 'formal-room' });",
      ].join("\n")),
      buildCreatorBundle([
        'import { mountGameClient } from "./source/game-client.js";',
        'import { createPrototypeAdapter } from "./source/prototype-adapter.js";',
        "mountGameClient(createPrototypeAdapter());",
      ].join("\n")),
    ]);
    bundle = serverOutput.outputFiles[0]?.text ?? "";
    formalClientBundle = formalClientOutput.outputFiles[0]?.text ?? "";
    prototypeBundle = prototypeOutput.outputFiles[0]?.text ?? "";
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("GAME_SDK_NODE_FREE_")) {
      throw new Error(message.match(/GAME_SDK_NODE_FREE_[A-Z_:-]+/)?.[0]
        ?? "GAME_SDK_NODE_FREE_BUILD_FAILED");
    }
    throw new Error("GAME_SDK_NODE_FREE_BUILD_FAILED");
  }
  if (
    !bundle
    || !formalClientBundle
    || !prototypeBundle
    || [bundle, formalClientBundle, prototypeBundle].some((output) => Buffer.byteLength(output, "utf8") > 1024 * 1024)
  ) {
    throw new Error("GAME_SDK_NODE_FREE_SERVER_BUNDLE_INVALID");
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
