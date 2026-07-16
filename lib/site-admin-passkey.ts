import { createHash } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { listSiteAdminPasskeys, findSiteAdminPasskey } from "@/lib/site-admin-passkey-store";

export function siteAdminWebAuthnConfiguration() {
  const production = process.env.NODE_ENV === "production";
  const rpID = process.env.SITE_ADMIN_WEBAUTHN_RP_ID?.trim() || (production ? "game-fields.com" : "localhost");
  const origin = process.env.SITE_ADMIN_WEBAUTHN_ORIGIN?.trim() || (production ? "https://www.game-fields.com" : "http://localhost:3000");
  return { rpID, origin };
}

export async function siteAdminRegistrationOptions(email: string) {
  const { rpID } = siteAdminWebAuthnConfiguration();
  const existing = await listSiteAdminPasskeys(email);
  return generateRegistrationOptions({
    rpName: "GAME FIELDS Admin",
    rpID,
    userName: email,
    userDisplayName: email,
    userID: new Uint8Array(createHash("sha256").update(`site-admin:${email}`).digest()),
    attestationType: "none",
    timeout: 120_000,
    excludeCredentials: existing.map((passkey) => ({ id: passkey.credentialId, transports: passkey.credential.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
}

export async function siteAdminAuthenticationOptions(email: string) {
  const { rpID } = siteAdminWebAuthnConfiguration();
  const passkeys = await listSiteAdminPasskeys(email);
  if (!passkeys.length) return null;
  return generateAuthenticationOptions({
    rpID,
    timeout: 120_000,
    userVerification: "required",
    allowCredentials: passkeys.map((passkey) => ({ id: passkey.credentialId, transports: passkey.credential.transports })),
  });
}

export async function verifySiteAdminRegistration(response: RegistrationResponseJSON, expectedChallenge: string) {
  const { rpID, origin } = siteAdminWebAuthnConfiguration();
  return verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
}

export async function verifySiteAdminAuthentication(response: AuthenticationResponseJSON, expectedChallenge: string, email: string) {
  const { rpID, origin } = siteAdminWebAuthnConfiguration();
  const passkey = await findSiteAdminPasskey(response.id);
  if (!passkey || passkey.email !== email) throw new Error("SITE_ADMIN_PASSKEY_NOT_FOUND");
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: passkey.credential,
    requireUserVerification: true,
  });
  return { verification, passkey };
}
