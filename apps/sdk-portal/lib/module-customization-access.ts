import "server-only";

export type CreatorModuleCustomizationAccess = {
  allowed: boolean;
  policy: "developer-preview";
};

/**
 * Server-owned entitlement boundary for changing a game's module profile.
 *
 * Developer preview currently includes this capability for the linked owner.
 * A future paid plan can replace this decision without exposing billing state
 * to the public SDK or changing the AppSet contract.
 */
export async function getCreatorModuleCustomizationAccess(input: {
  creatorSlug: string;
  ownerPlayerId: string;
}): Promise<CreatorModuleCustomizationAccess> {
  return {
    allowed: Boolean(input.creatorSlug && input.ownerPlayerId),
    policy: "developer-preview",
  };
}
