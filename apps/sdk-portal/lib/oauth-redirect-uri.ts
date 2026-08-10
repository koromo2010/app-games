/**
 * OAuth native clients such as Claude Code use a loopback redirect with a
 * short-lived random port. Remote web clients must continue to use HTTPS.
 */
export function isAllowedOAuthRedirectUri(value: string) {
  let uri: URL;
  try {
    uri = new URL(value);
  } catch {
    return false;
  }
  if (uri.username || uri.password || uri.hash) return false;
  if (uri.protocol === "https:") return true;
  if (uri.protocol !== "http:" || uri.pathname !== "/callback" || uri.search) {
    return false;
  }
  return uri.hostname === "localhost"
    || uri.hostname === "127.0.0.1"
    || uri.hostname === "[::1]";
}
