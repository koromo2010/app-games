export type ApprovedSdkGamePresentation = {
  title: {
    ja: string;
    en: string;
  };
  visual: string;
};

const defaultPresentation = {
  visual: "/game-visuals/sdk-game-placeholder.svg",
} as const;

/**
 * Platform-owned presentation for approved SDK games.
 *
 * Package manifests remain immutable after review. Public names and catalog
 * artwork can still evolve without rewriting the approved AppSet revision, so
 * those display-only choices live here instead of in game-specific branches.
 */
export const approvedSdkGamePresentations: Readonly<
  Record<string, ApprovedSdkGamePresentation>
> = {
  "ai-word-guess": {
    title: {
      ja: "コトバに迫れ",
      en: "Close in on the Word",
    },
    visual: "/game-visuals/kotoba-ni-semare.webp",
  },
};

export function resolveApprovedSdkGamePresentation(input: {
  gameId: string;
  fallbackTitle: {
    ja: string;
    en: string;
  };
}) {
  const presentation = approvedSdkGamePresentations[input.gameId];
  return presentation ?? {
    title: input.fallbackTitle,
    visual: defaultPresentation.visual,
  };
}
