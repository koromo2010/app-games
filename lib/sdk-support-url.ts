export function sdkSupportThreadUrl(
  requestUrl: string,
  reportId: string,
  gitRef = process.env.VERCEL_GIT_COMMIT_REF,
) {
  const hostname = new URL(requestUrl).hostname.toLocaleLowerCase("en-US");
  const production = gitRef === "main"
    || (
      !gitRef
      && (
        hostname === "game-fields.com"
        || hostname === "www.game-fields.com"
      )
    );
  const url = new URL(
    "/support",
    production
      ? "https://sdk.game-fields.com"
      : "https://sdk-dev.game-fields.com",
  );
  url.searchParams.set("thread", reportId);
  return url.toString();
}
