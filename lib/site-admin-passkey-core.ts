export function siteAdminWebAuthnConfiguration(env: Record<string, string | undefined>) {
  const production = env.NODE_ENV === "production";
  const rpID = env.SITE_ADMIN_WEBAUTHN_RP_ID?.trim() || (production ? "game-fields.com" : "localhost");
  const configuredOrigins = env.SITE_ADMIN_WEBAUTHN_ORIGIN?.split(",").map((value) => value.trim()).filter(Boolean);
  const origins = configuredOrigins?.length
    ? configuredOrigins
    : production
      ? ["https://game-fields.com", "https://www.game-fields.com"]
      : ["http://localhost:3000"];

  return { rpID, origin: origins.length === 1 ? origins[0] : origins };
}
