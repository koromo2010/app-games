import {
  playerAccountHasUnverifiedEmail,
  playerAccountHasVerifiedEmail,
  type VerifiablePlayerEmail,
} from "./player-email-verification-policy.ts";

export type PlayerAccountSecuritySummary = {
  recoveryEmailStatus: "none" | "unverified" | "verified";
  recoveryEmailHint: string | null;
};

export function maskRecoveryEmail(email: string | null) {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at >= email.length - 1) return null;

  const local = email.slice(0, at);
  const domainParts = email.slice(at + 1).split(".");
  const domainName = domainParts.shift();
  if (!domainName) return null;

  const maskedLocal = `${local.slice(0, 1)}***`;
  const maskedDomain = `${domainName.slice(0, 1)}***`;
  const suffix = domainParts.length > 0 ? `.${domainParts.join(".")}` : "";
  return `${maskedLocal}@${maskedDomain}${suffix}`;
}

export function playerAccountSecuritySummary(
  account: VerifiablePlayerEmail,
): PlayerAccountSecuritySummary {
  return {
    recoveryEmailStatus: playerAccountHasVerifiedEmail(account)
      ? "verified"
      : playerAccountHasUnverifiedEmail(account)
        ? "unverified"
        : "none",
    recoveryEmailHint: maskRecoveryEmail(account.email),
  };
}
