import type { RuntimeArtifactReader } from "@game-fields/sdk-runtime-artifact";
import { buildGamePackageExport } from "./game-package-export.ts";

const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const LINEAGE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const REVISION = /^[a-f0-9]{40}$/;
const SHA = /^[a-f0-9]{64}$/;

export type OperatorPackageExportInput = {
  publicGameId: string;
  lineageId: string;
  revision: string;
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
};

export type CurrentAppReleaseExportRecord = {
  id: string;
  lineageId: string;
  publicGameId: string;
  sourceCreatorSlug: string;
  sourceGameId: string;
  sourceEnvironment: string;
  title: string;
  revision: string;
  sourceRevision: string;
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
  manifest: unknown;
  modulePolicy: unknown;
  releasedAt: string;
};

export type OperatorPackageExportResult =
  | { status: "ok"; archive: Buffer; filename: string; release: CurrentAppReleaseExportRecord }
  | { status: "input_invalid" | "not_found" | "unavailable" };

function validInput(input: OperatorPackageExportInput) {
  return ID.test(input.publicGameId)
    && LINEAGE.test(input.lineageId)
    && REVISION.test(input.revision)
    && SHA.test(input.packageRootSha256)
    && SHA.test(input.serverBundleSha256)
    && SHA.test(input.appSetSourceSha256);
}

export async function prepareOperatorPackageExport(
  input: OperatorPackageExportInput,
  dependencies: {
    findCurrent: (input: OperatorPackageExportInput) => Promise<CurrentAppReleaseExportRecord | undefined>;
    reader: RuntimeArtifactReader;
    now?: string;
  },
): Promise<OperatorPackageExportResult> {
  if (!validInput(input)) return { status: "input_invalid" };
  const release = await dependencies.findCurrent(input);
  if (!release || release.sourceEnvironment !== "development") return { status: "not_found" };
  try {
    const result = await buildGamePackageExport({
      metadata: {
        creatorSlug: release.sourceCreatorSlug,
        gameId: release.sourceGameId,
        revision: release.revision,
        createdAt: release.releasedAt,
        packageRootSha256: release.packageRootSha256,
        serverBundleSha256: release.serverBundleSha256,
        appSetSourceSha256: release.appSetSourceSha256,
        sdkPackageVersion: null,
        sdkContractVersion: null,
      },
      reader: dependencies.reader,
      exportedAt: dependencies.now,
    });
    return {
      status: "ok",
      archive: result.archive,
      filename: `${release.publicGameId}-${release.revision.slice(0, 12)}-main-runtime-package.zip`,
      release,
    };
  } catch {
    return { status: "unavailable" };
  }
}
