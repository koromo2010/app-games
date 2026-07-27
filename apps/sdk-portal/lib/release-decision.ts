export type ReleaseDecisionInput = {
  reason: string;
  actorRef: string;
};

export type NormalizedReleaseDecision = {
  reason: string;
  actorRef: string;
};

export function normalizeReleaseDecision(
  value: unknown,
): NormalizedReleaseDecision | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ReleaseDecisionInput>;
  const reason = typeof item.reason === "string" ? item.reason.trim() : "";
  const actorRef = typeof item.actorRef === "string"
    ? item.actorRef.trim().toLowerCase()
    : "";
  if (
    reason.length < 5
    || reason.length > 500
    || actorRef.length < 1
    || actorRef.length > 320
  ) {
    return null;
  }
  return { reason, actorRef };
}
