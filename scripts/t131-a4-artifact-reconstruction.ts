import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  createT131A4FutureTransportDraft,
  prepareT131A4TwoTargetReconstruction,
  t131A4JsonDocument,
  t131A4Targets,
} from "../apps/sdk-portal/lib/creator-artifact-reconstruction.ts";

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArgs(argv: readonly string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("A4_LOCAL_ARGUMENTS_INVALID");
    }
    if (values.has(key)) throw new Error("A4_LOCAL_ARGUMENTS_INVALID");
    values.set(key, value);
  }
  const archive = values.get("--archive");
  if (!archive) throw new Error("USER_LOCAL_A0_ZIP_SELECTION_REQUIRED");
  const outputDirectory = values.get("--output-dir");
  if (!outputDirectory) throw new Error("A4_LOCAL_OUTPUT_DIRECTORY_REQUIRED");
  if (values.size !== 2) throw new Error("A4_LOCAL_ARGUMENTS_INVALID");
  return {
    archive: isAbsolute(archive) ? archive : resolve(archive),
    outputDirectory: isAbsolute(outputDirectory) ? outputDirectory : resolve(outputDirectory),
  };
}

const outputNames = {
  "moi-lab2": "Game-Fields-T-131-A4-moi-lab2-current-format-reconstruction.bundle.zip",
  "yabobojpn-lab": "Game-Fields-T-131-A4-yabobojpn-lab-current-format-reconstruction.bundle.zip",
} as const;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.archive)) throw new Error("USER_LOCAL_A0_ZIP_SELECTION_REQUIRED");
  const archive = readFileSync(args.archive);
  const result = await prepareT131A4TwoTargetReconstruction({ archive });
  const resultDocument = {
    schemaVersion: 1,
    phaseId: "T-131-A4",
    state: "LOCAL_TWO_TARGET_ZIP_DERIVED_CURRENT_FORMAT_RECONSTRUCTION_READY",
    next: "TARGET_BUNDLES_TRANSFER_AUTHORIZATION_PENDING",
    task: "TASK_ACTIVE",
    closed: false,
    aggregateIndexSha256: result.aggregateIndexSha256,
    targets: result.bundles.map((bundle) => ({
      target: bundle.target,
      bundleBytes: bundle.archive.byteLength,
      bundleSha256: bundle.archiveSha256,
      locatorCount: bundle.manifest.locatorCount,
      outputFileCount: bundle.manifest.outputFileCount,
      outputSetSha256: bundle.manifest.outputSetSha256,
      provenanceSha256: bundle.manifest.provenanceSha256,
      compatibilitySha256: bundle.manifest.compatibilitySha256,
    })),
    externalWrites: 0,
  } as const;
  const outputs = [
    ...result.bundles.map((bundle) => ({
      path: resolve(args.outputDirectory, outputNames[bundle.target]),
      content: bundle.archive,
    })),
    {
      path: resolve(args.outputDirectory, "Game-Fields-T-131-A4-two-target-aggregate-index.json"),
      content: result.aggregateIndexBytes,
    },
    {
      path: resolve(args.outputDirectory, "Game-Fields-T-131-A4-future-transport-draft.md"),
      content: Buffer.from(createT131A4FutureTransportDraft(result), "utf8"),
    },
    {
      path: resolve(args.outputDirectory, "Game-Fields-T-131-A4-local-result.json"),
      content: t131A4JsonDocument(resultDocument),
    },
  ];
  if (outputs.some(({ path }) => existsSync(path))) throw new Error("A4_LOCAL_OUTPUT_ALREADY_EXISTS");
  mkdirSync(args.outputDirectory, { recursive: true });
  for (const output of outputs) writeFileSync(output.path, output.content, { flag: "wx" });
  if (
    result.bundles.map(({ target }) => target).join("|") !== t131A4Targets.join("|")
    || outputs.some(({ path, content }) => sha256(readFileSync(path)) !== sha256(content))
  ) throw new Error("A4_LOCAL_OUTPUT_READBACK_MISMATCH");
  process.stdout.write(`${JSON.stringify(resultDocument)}\n`);
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "A4_LOCAL_RECONSTRUCTION_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
