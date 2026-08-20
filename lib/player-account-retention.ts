export const unverifiedPlayerAccountRetentionMs = 30 * 24 * 60 * 60 * 1_000;

export function playerAccountHasReliableActivity(
  account: { lastActivityAt?: number | null },
) {
  return typeof account.lastActivityAt === "number"
    && Number.isFinite(account.lastActivityAt)
    && account.lastActivityAt > 0;
}

export function unverifiedAccountIsExpired(
  account: { email: string | null; lastActivityAt?: number | null },
  now = Date.now(),
) {
  return !account.email
    && playerAccountHasReliableActivity(account)
    && account.lastActivityAt! <= now - unverifiedPlayerAccountRetentionMs;
}
