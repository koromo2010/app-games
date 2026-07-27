type SiteAdminAuthenticatorAttachment = "cross-platform" | "platform" | undefined;

export function isInternalSiteAdminPasskeyTransport(
  transports: readonly string[] | undefined,
) {
  return Boolean(transports?.includes("internal"));
}

export function assertSiteAdminPlatformPasskeyRegistration(input: {
  authenticatorAttachment: SiteAdminAuthenticatorAttachment;
  transports: readonly string[] | undefined;
}) {
  if (
    input.authenticatorAttachment === "cross-platform"
    || !isInternalSiteAdminPasskeyTransport(input.transports)
  ) {
    throw new Error("SITE_ADMIN_PLATFORM_PASSKEY_REQUIRED");
  }
}
