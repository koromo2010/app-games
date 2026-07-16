export const unverifiedPlayerAccountRetentionMs = 30 * 24 * 60 * 60 * 1_000;

export function unverifiedAccountIsExpired(
  account: { email: string | null; updatedAt: number },
  now = Date.now(),
) {
  return !account.email && account.updatedAt <= now - unverifiedPlayerAccountRetentionMs;
}
