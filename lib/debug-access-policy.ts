export function roomRequestsDebugMode(room: unknown) {
  return Boolean(room && typeof room === "object" && "debugMode" in room && (room as { debugMode?: unknown }).debugMode === true);
}

export function actionRequiresDebugAccess(action: unknown) {
  if (!action || typeof action !== "object") return false;
  const candidate = action as { type?: unknown; enabled?: unknown; actorId?: unknown; playerId?: unknown };
  if (typeof candidate.type !== "string") return false;
  return candidate.type === "abort-game"
    || candidate.type.startsWith("debug-")
    || candidate.type === "set-debug-replay"
    || (typeof candidate.actorId === "string" && typeof candidate.playerId === "string" && candidate.actorId !== candidate.playerId)
    || (candidate.type === "set-debug" && candidate.enabled === true);
}

function normalizeDebugAccessEmail(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

export function playerEmailHasAdminDebugAccess(playerEmail: string | null | undefined, adminEmails: readonly string[]) {
  if (!playerEmail) return false;
  const normalizedPlayerEmail = normalizeDebugAccessEmail(playerEmail);
  if (!normalizedPlayerEmail) return false;
  return adminEmails.some((email) => normalizeDebugAccessEmail(email) === normalizedPlayerEmail);
}

export function playerHasResolvedDebugAccess(
  playerEmail: string | null | undefined,
  adminEmails: readonly string[],
  manuallyGranted: boolean,
) {
  return manuallyGranted || playerEmailHasAdminDebugAccess(playerEmail, adminEmails);
}
