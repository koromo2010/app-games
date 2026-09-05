/**
 * Normalizes only byte-preserving publish_mock input representations.  It never
 * invents creator source: an absent or ambiguous source file remains invalid.
 */
export const REQUIRED_PUBLISH_MOCK_SOURCE_PATHS = [
  "source/app-set.ts",
  "source/contracts.ts",
  "source/manifest.ts",
  "source/server-module.ts",
  "source/game-client.tsx",
  "source/prototype-adapter.ts",
] as const;

type FileEntry = { path?: unknown; content?: unknown; encoding?: unknown };

export type RecoveredPrototypeInput = {
  files: Record<string, string>;
  repaired: boolean;
};

function invalid(): never {
  throw new Error("SDK_PROTOTYPE_INPUT_INVALID");
}

function addFile(target: Record<string, string>, path: unknown, content: unknown) {
  if (typeof path !== "string" || !path || typeof content !== "string") invalid();
  const previous = target[path];
  if (previous !== undefined && previous !== content) invalid();
  target[path] = content;
}

/**
 * `files` has historically been a path map.  A path/content list is the same
 * data in the package tool and can be losslessly converted.  `src/**` is the
 * starter's source-root spelling, so it is moved as a whole to the canonical
 * `source/**` root only when there is no conflicting canonical file.
 */
export function recoverPublishMockInputFiles(value: unknown): RecoveredPrototypeInput {
  const files: Record<string, string> = {};
  let repaired = false;
  if (Array.isArray(value)) {
    repaired = true;
    for (const raw of value) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid();
      const entry = raw as FileEntry;
      if (entry.encoding !== undefined && entry.encoding !== "utf-8") invalid();
      addFile(files, entry.path, entry.content);
    }
  } else if (value && typeof value === "object") {
    for (const [path, content] of Object.entries(value as Record<string, unknown>)) {
      addFile(files, path, content);
    }
  } else {
    invalid();
  }

  for (const [path, content] of Object.entries({ ...files })) {
    if (!path.startsWith("src/")) continue;
    const canonicalPath = `source/${path.slice("src/".length)}`;
    const current = files[canonicalPath];
    if (current !== undefined && current !== content) invalid();
    if (current === undefined) files[canonicalPath] = content;
    delete files[path];
    repaired = true;
  }

  for (const required of REQUIRED_PUBLISH_MOCK_SOURCE_PATHS) {
    if (!files[required]?.trim()) invalid();
  }
  return { files, repaired };
}
