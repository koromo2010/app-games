export type SdkOwnerStatus =
  | "authorized"
  | "creator_not_found"
  | "creator_deleted"
  | "owner_null"
  | "owner_empty"
  | "owner_mismatch";

export type CreatorOwnerRecord = {
  id: string;
  slug: string;
  display_name: string;
  owner_player_id: string | null;
  deleted_at: string | null;
};

export type AuthorizedCreatorRecord = Pick<
  CreatorOwnerRecord,
  "id" | "slug" | "display_name"
>;

export type SdkOwnerResolution =
  | { status: "authorized"; creator: AuthorizedCreatorRecord }
  | { status: Exclude<SdkOwnerStatus, "authorized"> };

export function classifyCreatorOwner(
  creator: CreatorOwnerRecord | undefined,
  playerId: string,
): SdkOwnerResolution {
  if (!creator) return { status: "creator_not_found" };
  if (creator.deleted_at) return { status: "creator_deleted" };
  if (creator.owner_player_id === null) return { status: "owner_null" };
  if (creator.owner_player_id === "") return { status: "owner_empty" };
  return creator.owner_player_id === playerId
    ? {
        status: "authorized",
        creator: {
          id: creator.id,
          slug: creator.slug,
          display_name: creator.display_name,
        },
      }
    : { status: "owner_mismatch" };
}

export type SdkSessionResolution<T> =
  | { status: "session_missing" }
  | { status: "session_authorized"; account: T };

export async function resolveSdkSession<T>(
  readSession: () => Promise<T | null>,
): Promise<SdkSessionResolution<T>> {
  const account = await readSession();
  return account === null
    ? { status: "session_missing" }
    : { status: "session_authorized", account };
}
