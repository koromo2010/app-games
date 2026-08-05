import type { RuntimeArtifactReader } from "@game-fields/sdk-runtime-artifact";
import {
  buildGamePackageExport,
  type PackageExportMetadata,
} from "./game-package-export.ts";

const CREATOR_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const GAME_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const REVISION = /^[a-f0-9]{40}$/;

export type OwnedGamePackageRevision = Omit<
  PackageExportMetadata,
  "creatorSlug" | "gameId"
> & {
  channel: "candidate" | "development" | "stable" | null;
};

export type OwnedGamePackageExportResult =
  | { status: "ok"; archive: Buffer; filename: string }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "unavailable" };

export async function prepareOwnedGamePackageExport(
  input: {
    ownerPlayerId: string | null;
    creatorSlug: string;
    gameId: string;
    revision: string;
  },
  dependencies: {
    listRevisions: (input: {
      ownerPlayerId: string;
      creatorSlug: string;
      gameId: string;
    }) => Promise<OwnedGamePackageRevision[]>;
    reader: RuntimeArtifactReader;
  },
): Promise<OwnedGamePackageExportResult> {
  if (!input.ownerPlayerId?.trim()) return { status: "unauthenticated" };
  if (
    !CREATOR_SLUG.test(input.creatorSlug)
    || !GAME_ID.test(input.gameId)
    || !REVISION.test(input.revision)
  ) {
    return { status: "not_found" };
  }

  const revisions = await dependencies.listRevisions({
    ownerPlayerId: input.ownerPlayerId,
    creatorSlug: input.creatorSlug,
    gameId: input.gameId,
  });
  const metadata = revisions.find((item) => item.revision === input.revision);
  if (!metadata) return { status: "not_found" };

  try {
    const result = await buildGamePackageExport({
      metadata: {
        creatorSlug: input.creatorSlug,
        gameId: input.gameId,
        ...metadata,
      },
      reader: dependencies.reader,
    });
    return {
      status: "ok",
      archive: result.archive,
      filename: `${input.gameId}-${input.revision.slice(0, 12)}-runtime-package.zip`,
    };
  } catch {
    return { status: "unavailable" };
  }
}
