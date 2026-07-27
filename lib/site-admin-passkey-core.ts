function isDevelopmentAdminEnvironment(env: Record<string, string | undefined>) {
  const configuredEnvironment = env.GAME_FIELDS_ENV?.trim().toLowerCase();
  const projectName = env.VERCEL_PROJECT_NAME?.trim().toLowerCase();
  const branch = env.VERCEL_GIT_COMMIT_REF?.trim();
  const developBranch = branch === "develop";
  const developmentProject = projectName === "app-games-dev";
  const productionProject = projectName === "app-games";
  const hasDeploymentIdentity = developmentProject || productionProject || Boolean(branch);
  const inferredDevelopment = developmentProject || (!productionProject && developBranch);

  if (
    configuredEnvironment
    && hasDeploymentIdentity
    && (inferredDevelopment !== (configuredEnvironment === "development"))
  ) {
    throw new Error("SITE_ADMIN_WEBAUTHN_ENVIRONMENT_CONFLICT");
  }
  if (developmentProject) return true;
  if (productionProject) return false;
  if (configuredEnvironment) return configuredEnvironment === "development";
  return developBranch;
}

function isOriginWithinRpID(origin: string, rpID: string) {
  const hostname = new URL(origin).hostname;
  return hostname === rpID || hostname.endsWith(`.${rpID}`);
}

export function siteAdminWebAuthnConfiguration(env: Record<string, string | undefined>) {
  const production = env.NODE_ENV === "production";
  const development = production && isDevelopmentAdminEnvironment(env);
  const defaultRpID = production
    ? development
      ? "dev.game-fields.com"
      : "game-fields.com"
    : "localhost";
  const rpID = env.SITE_ADMIN_WEBAUTHN_RP_ID?.trim() || defaultRpID;
  const configuredOrigins = env.SITE_ADMIN_WEBAUTHN_ORIGIN?.split(",").map((value) => value.trim()).filter(Boolean);
  const origins = configuredOrigins?.length
    ? configuredOrigins
    : production
      ? development
        ? ["https://dev.game-fields.com"]
        : ["https://game-fields.com", "https://www.game-fields.com"]
      : ["http://localhost:3000"];

  if (development && rpID === "game-fields.com") {
    throw new Error("SITE_ADMIN_WEBAUTHN_RP_ID_UNSAFE_SHARED");
  }
  if (origins.some((origin) => !isOriginWithinRpID(origin, rpID))) {
    throw new Error("SITE_ADMIN_WEBAUTHN_ORIGIN_RP_ID_MISMATCH");
  }

  return { rpID, origin: origins.length === 1 ? origins[0] : origins };
}
