export function roomRequestsDebugMode(room: unknown) {
  return Boolean(room && typeof room === "object" && "debugMode" in room && (room as { debugMode?: unknown }).debugMode === true);
}

export function actionRequiresDebugAccess(action: unknown, authenticatedActorId?: string) {
  if (!action || typeof action !== "object") return false;
  const candidate = action as { type?: unknown; enabled?: unknown; force?: unknown; actorId?: unknown; playerId?: unknown };
  if (typeof candidate.type !== "string") return false;
  const impersonatesAuthenticatedPlayer = Boolean(
    authenticatedActorId
    && typeof candidate.playerId === "string"
    && candidate.playerId !== authenticatedActorId,
  );
  return candidate.type === "abort-game"
    || candidate.type.startsWith("debug-")
    || candidate.type === "set-debug-replay"
    || (candidate.type === "advance-phase" && candidate.force === true)
    || impersonatesAuthenticatedPlayer
    || (typeof candidate.actorId === "string" && typeof candidate.playerId === "string" && candidate.actorId !== candidate.playerId)
    || (candidate.type === "set-debug" && candidate.enabled === true);
}

function normalizeDebugAccessEmail(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

export function playerEmailHasAdminDebugAccess(
  playerEmail: string | null | undefined,
  emailVerifiedAt: number | null | undefined,
  adminEmails: readonly string[],
) {
  if (!playerEmail || !emailVerifiedAt) return false;
  const normalizedPlayerEmail = normalizeDebugAccessEmail(playerEmail);
  if (!normalizedPlayerEmail) return false;
  return adminEmails.some((email) => normalizeDebugAccessEmail(email) === normalizedPlayerEmail);
}

export function playerHasResolvedDebugAccess(
  playerEmail: string | null | undefined,
  emailVerifiedAt: number | null | undefined,
  adminEmails: readonly string[],
  manuallyGranted: boolean,
) {
  return manuallyGranted || playerEmailHasAdminDebugAccess(playerEmail, emailVerifiedAt, adminEmails);
}
