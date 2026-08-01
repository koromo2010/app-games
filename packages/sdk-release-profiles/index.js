const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const PLUGIN_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOWNLOAD_ME_BASE_NAME_PATTERN = /^GameFieldsDownloadMe(?:-dev)?$/;
const ENVIRONMENTS = ["production", "development"];

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function normalizePortalBaseUrl(value, label) {
  if (typeof value !== "string") throw new Error(`${label} must be a URL.`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a URL.`);
  }
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${label} must be an HTTPS origin without a path, query, or fragment.`);
  }
  return parsed.origin;
}

export function validateSdkReleaseProfiles(profileConfig) {
  assertObject(profileConfig, "SDK release profiles");
  if (profileConfig.schemaVersion !== 1) {
    throw new Error("SDK release profile schemaVersion must be 1.");
  }
  assertObject(profileConfig.profiles, "SDK release profiles.profiles");

  for (const environment of ENVIRONMENTS) {
    const profile = profileConfig.profiles[environment];
    assertObject(profile, `SDK release profile ${environment}`);
    if (profile.environment !== environment) {
      throw new Error(`SDK release profile ${environment} must declare environment=${environment}.`);
    }
    const expectedChannel = environment === "production" ? "stable" : "developer-preview";
    const expectedStarterRef = environment === "production" ? "sdk-starter" : "sdk-starter-dev";
    const expectedBaseName = environment === "production"
      ? "GameFieldsDownloadMe"
      : "GameFieldsDownloadMe-dev";
    if (profile.channel !== expectedChannel) {
      throw new Error(`SDK release profile ${environment} must use channel=${expectedChannel}.`);
    }
    if (profile.starterRef !== expectedStarterRef) {
      throw new Error(`SDK release profile ${environment} must use starterRef=${expectedStarterRef}.`);
    }
    if (profile.downloadMeBaseName !== expectedBaseName
      || !DOWNLOAD_ME_BASE_NAME_PATTERN.test(profile.downloadMeBaseName ?? "")) {
      throw new Error(`SDK release profile ${environment} must use DownloadMe base name ${expectedBaseName}.`);
    }
    if (!PLUGIN_NAME_PATTERN.test(profile.pluginName ?? "")) {
      throw new Error(`SDK release profile ${environment} must define a concrete lowercase pluginName.`);
    }
    const normalizedPortalBaseUrl = normalizePortalBaseUrl(
      profile.portalBaseUrl,
      `SDK release profile ${environment}.portalBaseUrl`,
    );
    if (profile.portalBaseUrl !== normalizedPortalBaseUrl) {
      throw new Error(`SDK release profile ${environment}.portalBaseUrl must use its canonical origin.`);
    }
  }

  if (profileConfig.profiles.production.portalBaseUrl === profileConfig.profiles.development.portalBaseUrl) {
    throw new Error("Production and development SDK Portal origins must differ.");
  }
  if (profileConfig.profiles.production.pluginName === profileConfig.profiles.development.pluginName) {
    throw new Error("Production and development plugin names must differ.");
  }
  return profileConfig;
}

export function validateSdkReleaseConfiguration(release, profileConfig) {
  assertObject(release, "platform release");
  if (!SEMVER_PATTERN.test(release.platformVersion ?? "")) {
    throw new Error("platformVersion must be a semantic version such as 0.1.0.");
  }
  if (release.sdkPackageVersion !== release.platformVersion) {
    throw new Error("sdkPackageVersion must match platformVersion for the current release train.");
  }
  if (Object.hasOwn(release, "downloadMeVersion")) {
    throw new Error("downloadMeVersion must not diverge from platformVersion; DownloadMe uses platformVersion directly.");
  }
  if (Object.hasOwn(release, "channel") || Object.hasOwn(release, "starterRef")) {
    throw new Error("Environment-specific channel and starterRef belong in sdk-release-profiles.json.");
  }
  validateSdkReleaseProfiles(profileConfig);
  return { release, profileConfig };
}

export function resolveSdkReleaseEnvironment({
  requestedEnvironment,
  gitRef,
  portalBaseUrl,
  defaultEnvironment,
  profileConfig,
}) {
  validateSdkReleaseProfiles(profileConfig);
  const candidates = [];
  const requested = requestedEnvironment?.trim().toLowerCase();
  if (requested) {
    if (ENVIRONMENTS.includes(requested)) candidates.push(["requested environment", requested]);
    else {
      throw new Error(`Unknown SDK release environment: ${requestedEnvironment}`);
    }
  }

  if (portalBaseUrl) {
    const origin = normalizePortalBaseUrl(portalBaseUrl, "SDK Portal base URL");
    const environment = ENVIRONMENTS.find(
      (candidate) => profileConfig.profiles[candidate].portalBaseUrl === origin,
    );
    if (!environment) throw new Error(`Unknown SDK Portal origin: ${origin}`);
    candidates.push(["SDK Portal origin", environment]);
  }

  const normalizedGitRef = gitRef?.trim();
  if (normalizedGitRef) {
    if (normalizedGitRef === "main") candidates.push(["Git ref", "production"]);
    else if (normalizedGitRef === "develop") candidates.push(["Git ref", "development"]);
    else throw new Error(`Unsupported SDK Portal Git ref: ${normalizedGitRef}`);
  }

  if (candidates.length > 0) {
    const environments = new Set(candidates.map(([, environment]) => environment));
    if (environments.size > 1) {
      throw new Error(`Conflicting SDK release environment signals: ${candidates
        .map(([source, environment]) => `${source}=${environment}`)
        .join(", ")}`);
    }
    return candidates[0][1];
  }

  if (defaultEnvironment) {
    if (ENVIRONMENTS.includes(defaultEnvironment)) return defaultEnvironment;
    throw new Error(`Unknown default SDK release environment: ${defaultEnvironment}`);
  }
  throw new Error("SDK release environment could not be resolved.");
}

export function resolveSdkReleaseProfile({
  release,
  profileConfig,
  requestedEnvironment,
  gitRef,
  portalBaseUrl,
  defaultEnvironment,
}) {
  validateSdkReleaseConfiguration(release, profileConfig);
  const environment = resolveSdkReleaseEnvironment({
    requestedEnvironment,
    gitRef,
    portalBaseUrl,
    defaultEnvironment,
    profileConfig,
  });
  return profileConfig.profiles[environment];
}

export function sdkDownloadMeVersion(release) {
  if (!SEMVER_PATTERN.test(release?.platformVersion ?? "")) {
    throw new Error("DownloadMe version requires a valid platformVersion.");
  }
  return release.platformVersion;
}

export function sdkDownloadMeFileName(release, profile) {
  if (!DOWNLOAD_ME_BASE_NAME_PATTERN.test(profile?.downloadMeBaseName ?? "")) {
    throw new Error("DownloadMe base name is invalid.");
  }
  return `${profile.downloadMeBaseName}-ver${sdkDownloadMeVersion(release)}.md`;
}

export function renderSdkDownloadMe(template, release, profile) {
  const replacements = new Map([
    ["__DOWNLOAD_ME_VERSION__", sdkDownloadMeVersion(release)],
    ["__DOWNLOAD_ME_FILE_NAME__", sdkDownloadMeFileName(release, profile)],
    ["__PLATFORM_VERSION__", release.platformVersion],
    ["__SDK_VERSION__", release.sdkPackageVersion],
    ["__SDK_HANDSHAKE_VERSION__", String(release.sdkHandshakeVersion)],
    ["__SDK_CONTRACT_VERSION__", String(release.sdkContractVersion)],
    ["__SDK_ENVIRONMENT__", profile.environment],
    ["__SDK_STARTER_REF__", profile.starterRef],
    ["__SDK_PORTAL_BASE_URL__", profile.portalBaseUrl],
    ["__SDK_PLUGIN_NAME__", profile.pluginName],
  ]);
  let rendered = template;
  for (const [token, value] of replacements) rendered = rendered.replaceAll(token, value);
  const unresolved = [...rendered.matchAll(/__[A-Z0-9_]+__/g)].map((match) => match[0]);
  if (unresolved.length > 0) {
    throw new Error(`DownloadMe contains unresolved tokens: ${[...new Set(unresolved)].join(", ")}`);
  }
  return rendered;
}
