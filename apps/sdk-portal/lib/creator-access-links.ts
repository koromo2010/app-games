function normalizedPortalBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

export function creatorAccountLinkUrl(input: {
  portalBaseUrl: string;
  creatorSlug: string;
}) {
  const url = new URL(
    "/api/account-link/start",
    `${normalizedPortalBaseUrl(input.portalBaseUrl)}/`,
  );
  url.searchParams.set("returnTo", `/${input.creatorSlug}`);
  return url.toString();
}

export function creatorMockGameUrl(input: {
  portalBaseUrl: string;
  creatorSlug: string;
  gameId: string;
}) {
  return `${normalizedPortalBaseUrl(input.portalBaseUrl)}/${
    encodeURIComponent(input.creatorSlug)
  }/mock/${encodeURIComponent(input.gameId)}`;
}
