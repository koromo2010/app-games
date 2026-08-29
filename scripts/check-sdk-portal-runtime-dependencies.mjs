import { builtinModules } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portalRoot = join(repositoryRoot, "apps/sdk-portal");
const manifestPath = join(portalRoot, "package.json");
const productionRoots = [join(portalRoot, "app"), join(portalRoot, "lib")];
const borrowedProductionSources = [
  join(repositoryRoot, "apps/sdk-preview/lib/server-runner.ts"),
];
const sourcePattern = /\.[cm]?[jt]sx?$/;
const importPattern = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g;
const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const expectedLinkedomImporters = [
  "apps/sdk-portal/lib/creator-authoring-state-legacy-mock-adapter.ts",
  "apps/sdk-portal/lib/creator-authoring-state-reconstruction.ts",
];

function collectSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSourceFiles(path);
      }
      return sourcePattern.test(entry.name) ? [path] : [];
    })
    .sort();
}

function packageName(specifier) {
  if (
    specifier.startsWith(".")
    || specifier.startsWith("/")
    || specifier.startsWith("@/")
    || builtins.has(specifier)
  ) {
    return null;
  }
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
}

function productionImports() {
  const importers = new Map();
  const sourceFiles = [
    ...productionRoots.flatMap(collectSourceFiles),
    ...borrowedProductionSources,
  ].sort();
  for (const path of sourceFiles) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const dependency = packageName(match[1]);
      if (!dependency) {
        continue;
      }
      const files = importers.get(dependency) ?? new Set();
      files.add(relative(repositoryRoot, path).replaceAll("\\", "/"));
      importers.set(dependency, files);
    }
  }
  return importers;
}

function declaredRuntimeDependencies(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
}

function undeclaredRuntimeDependencies(importers, manifest) {
  const declared = declaredRuntimeDependencies(manifest);
  return [...importers]
    .filter(([dependency]) => !declared.has(dependency))
    .map(([dependency, files]) => ({ dependency, files: [...files].sort() }))
    .sort((left, right) => left.dependency.localeCompare(right.dependency));
}

function fail(message, details) {
  console.error(`[sdk-portal-runtime-dependencies] ${message}`);
  for (const detail of details) {
    console.error(`- ${detail}`);
  }
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const importers = productionImports();
const missing = undeclaredRuntimeDependencies(importers, manifest);
if (missing.length > 0) {
  fail(
    "production source imports undeclared runtime dependencies",
    missing.map(({ dependency, files }) => `${dependency}: ${files.join(", ")}`),
  );
}

const linkedomImporters = [...(importers.get("linkedom") ?? [])].sort();
const uncoveredLinkedomImporters = expectedLinkedomImporters.filter(
  (path) => !linkedomImporters.includes(path),
);
if (uncoveredLinkedomImporters.length > 0) {
  fail("current linkedom importers are not covered", uncoveredLinkedomImporters);
}

const quickJsImporters = [...(importers.get("quickjs-emscripten") ?? [])].sort();
const expectedQuickJsImporter = "apps/sdk-preview/lib/server-runner.ts";
if (!quickJsImporters.includes(expectedQuickJsImporter)) {
  fail("borrowed SDK Preview runner dependency is not covered", [expectedQuickJsImporter]);
}

const missingLinkedomManifest = structuredClone(manifest);
delete missingLinkedomManifest.dependencies.linkedom;
const mutationResult = undeclaredRuntimeDependencies(importers, missingLinkedomManifest);
const linkedomMutation = mutationResult.find(({ dependency }) => dependency === "linkedom");
if (
  !linkedomMutation
  || expectedLinkedomImporters.some((path) => !linkedomMutation.files.includes(path))
) {
  fail("linkedom declaration-removal regression guard did not fail closed", []);
}

console.log(
  `[sdk-portal-runtime-dependencies] ${importers.size} direct production packages declared; `
  + `${linkedomImporters.length}/2 linkedom importers covered; `
  + `${quickJsImporters.length}/1 borrowed runner importer covered; declaration-removal guard PASS`,
);
