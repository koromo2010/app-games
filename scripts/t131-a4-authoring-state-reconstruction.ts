import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  prepareT131A4AuthoringStateReconstruction,
} from "../apps/sdk-portal/lib/creator-authoring-state-reconstruction.ts";
import { t131A4JsonDocument } from "../apps/sdk-portal/lib/creator-artifact-reconstruction.ts";

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArgs(argv: readonly string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--") || values.has(key)) {
      throw new Error("A4_LOCAL_ARGUMENTS_INVALID");
    }
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

const workspaceNames = {
  "moi-lab2": "Game-Fields-T-131-A4-moi-lab2-authoring-workspace.bundle.zip",
  "yabobojpn-lab": "Game-Fields-T-131-A4-yabobojpn-lab-authoring-workspace.bundle.zip",
} as const;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.archive)) throw new Error("USER_LOCAL_A0_ZIP_SELECTION_REQUIRED");
  const result = await prepareT131A4AuthoringStateReconstruction({
    archive: readFileSync(args.archive),
  });
  const complete = result.aggregateLedger.blockedGameCount === 0;
  const localResult = {
    schemaVersion: 1,
    phaseId: "T-131-A4",
    state: result.aggregateLedger.state,
    runtimeSmoke: result.aggregateLedger.runtimeSmoke,
    next: complete
      ? "WORKSPACE_BUNDLES_TRANSFER_AUTHORIZATION_PENDING"
      : "PER_GAME_BLOCKER_LEDGER_READY / SUPERVISOR_DECISION_REQUIRED",
    task: "TASK_ACTIVE",
    closed: false,
    gameCount: result.aggregateLedger.gameCount,
    readyGameCount: result.aggregateLedger.readyGameCount,
    blockedGameCount: result.aggregateLedger.blockedGameCount,
    targets: result.workspaces.map((workspace) => ({
      target: workspace.target,
      workspaceBundleBytes: workspace.archive.byteLength,
      workspaceBundleSha256: workspace.archiveSha256,
      gameCount: workspace.gameLedger.length,
      readyGameCount: workspace.readyGameCount,
      blockedGameCount: workspace.blockedGameCount,
    })),
    externalWrites: 0,
  } as const;
  const outputs = [
    ...result.workspaces.map((workspace) => ({
      path: resolve(args.outputDirectory, workspaceNames[workspace.target]),
      content: workspace.archive,
    })),
    {
      path: resolve(args.outputDirectory, "Game-Fields-T-131-A4-authoring-state-aggregate-ledger.json"),
      content: result.aggregateLedgerBytes,
    },
    {
      path: resolve(args.outputDirectory, "Game-Fields-T-131-A4-staged-recovery-plan.md"),
      content: Buffer.from(result.stagedRecoveryPlan, "utf8"),
    },
    {
      path: resolve(args.outputDirectory, "Game-Fields-T-131-A4-local-result.json"),
      content: t131A4JsonDocument(localResult),
    },
  ];
  if (outputs.some(({ path }) => existsSync(path))) throw new Error("A4_LOCAL_OUTPUT_ALREADY_EXISTS");
  mkdirSync(args.outputDirectory, { recursive: true });
  for (const output of outputs) writeFileSync(output.path, output.content, { flag: "wx" });
  if (outputs.some(({ path, content }) => sha256(readFileSync(path)) !== sha256(content))) {
    throw new Error("A4_LOCAL_OUTPUT_READBACK_MISMATCH");
  }
  process.stdout.write(`${JSON.stringify(localResult)}\n`);
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "A4_LOCAL_RECONSTRUCTION_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
