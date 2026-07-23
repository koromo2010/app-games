export type VerifiablePlayerEmail = {
  email: string | null;
  emailVerifiedAt: number | null;
};

export function playerAccountHasVerifiedEmail(account: VerifiablePlayerEmail) {
  return Boolean(account.email && account.emailVerifiedAt);
}

export function playerAccountHasUnverifiedEmail(account: VerifiablePlayerEmail) {
  return Boolean(account.email && !account.emailVerifiedAt);
}

export type PlayerEmailVerificationPayload = {
  version: 1;
  playerId: string;
  loginName: string;
  email: string;
  issuedAt: number;
};

export function parsePlayerEmailVerificationPayload(value: string): PlayerEmailVerificationPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<PlayerEmailVerificationPayload>;
    if (
      parsed.version !== 1
      || typeof parsed.playerId !== "string"
      || !parsed.playerId
      || typeof parsed.loginName !== "string"
      || !parsed.loginName
      || typeof parsed.email !== "string"
      || !parsed.email
      || typeof parsed.issuedAt !== "number"
      || !Number.isFinite(parsed.issuedAt)
    ) {
      return null;
    }
    return {
      version: 1,
      playerId: parsed.playerId,
      loginName: parsed.loginName,
      email: parsed.email,
      issuedAt: parsed.issuedAt,
    };
  } catch {
    return null;
  }
}
