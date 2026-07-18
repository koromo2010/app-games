export function isTerminalOnlineRoomFetchError(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  const status = (error as { status?: unknown }).status;
  return status === 403 || status === 404;
}
