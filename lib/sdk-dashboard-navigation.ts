type SdkPortalEnvironment = {
  SDK_PORTAL_INTERNAL_URL?: string;
  VERCEL_GIT_COMMIT_REF?: string;
};

export function sdkPortalInternalBaseUrl(
  env: SdkPortalEnvironment = {
    SDK_PORTAL_INTERNAL_URL: process.env.SDK_PORTAL_INTERNAL_URL,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
  },
) {
  return env.SDK_PORTAL_INTERNAL_URL?.replace(/\/$/, "")
    ?? (env.VERCEL_GIT_COMMIT_REF === "main"
      ? "https://sdk.game-fields.com"
      : "https://sdk-dev.game-fields.com");
}

export function sdkDashboardHrefForAccess(input: {
  href: string | undefined;
  isLoggedIn: boolean;
  isCreatorOwner: boolean;
}) {
  return input.href && input.isLoggedIn && input.isCreatorOwner
    ? input.href
    : undefined;
}
