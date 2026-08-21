import { createHash, randomBytes } from "node:crypto";
import { ensurePostgresSchema } from "@/lib/postgres-schema";
import { getPostgresClient, isPostgresConfigured } from "@/lib/postgres-store";
import {
  canConsumeSiteAdminTotpCounter,
  createSiteAdminTotpSecret,
  decryptSiteAdminTotpSecret,
  encryptSiteAdminTotpSecret,
  findSiteAdminTotpCounter,
  siteAdminTotpProvisioningUri,
} from "@/lib/site-admin-totp-core";

type SiteAdminTotpRow = {
  secret_ciphertext: string;
  secret_iv: string;
  secret_tag: string;
  enrollment_challenge_hash: string | null;
  confirmed_at: string | number | null;
  last_used_counter: string | number | null;
};

function requireStore() {
  if (!isPostgresConfigured()) throw new Error("SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED");
}

function encryptionMaterial() {
  const material = process.env.PLAYER_SESSION_SECRET
    || process.env.LLM_SESSION_SECRET
    || process.env.SITE_ADMIN_PASSWORD
    || process.env.DEBUG_MODE_PASSWORD;
  if (!material) throw new Error("SITE_ADMIN_TOTP_ENCRYPTION_NOT_CONFIGURED");
  return material;
}

function hashEnrollmentChallenge(challenge: string) {
  return createHash("sha256").update(`game-fields-site-admin-totp-enrollment:v1:${challenge}`).digest("hex");
}

function newEnrollmentChallenge() {
  return randomBytes(24).toString("base64url");
}

async function selectTotp(email: string) {
  const rows = await getPostgresClient()`
    SELECT secret_ciphertext, secret_iv, secret_tag, enrollment_challenge_hash, confirmed_at, last_used_counter
    FROM site_admin_totp
    WHERE admin_email = ${email}
    LIMIT 1
  ` as SiteAdminTotpRow[];
  return rows[0] ?? null;
}

function decryptedSecret(row: SiteAdminTotpRow) {
  return decryptSiteAdminTotpSecret({
    ciphertext: row.secret_ciphertext,
    iv: row.secret_iv,
    tag: row.secret_tag,
  }, encryptionMaterial());
}

export async function siteAdminTotpStatus(email: string) {
  requireStore(); await ensurePostgresSchema();
  const row = await selectTotp(email);
  return { enabled: Boolean(row?.confirmed_at), enrollmentPending: Boolean(row && !row.confirmed_at) };
}

export async function beginSiteAdminTotpEnrollment(email: string) {
  requireStore(); await ensurePostgresSchema();
  const existing = await selectTotp(email);
  if (existing?.confirmed_at) throw new Error("SITE_ADMIN_TOTP_ALREADY_ENROLLED");
  const secret = createSiteAdminTotpSecret();
  const challenge = newEnrollmentChallenge();
  const encrypted = encryptSiteAdminTotpSecret(secret, encryptionMaterial());
  const now = Date.now();
  const rows = await getPostgresClient()`
    INSERT INTO site_admin_totp (
      admin_email, secret_ciphertext, secret_iv, secret_tag, enrollment_challenge_hash,
      created_at, confirmed_at, last_used_counter, last_used_at
    ) VALUES (
      ${email}, ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.tag}, ${hashEnrollmentChallenge(challenge)},
      ${now}, NULL, NULL, NULL
    )
    ON CONFLICT (admin_email) DO UPDATE SET
      secret_ciphertext = EXCLUDED.secret_ciphertext,
      secret_iv = EXCLUDED.secret_iv,
      secret_tag = EXCLUDED.secret_tag,
      enrollment_challenge_hash = EXCLUDED.enrollment_challenge_hash,
      created_at = EXCLUDED.created_at,
      confirmed_at = NULL,
      last_used_counter = NULL,
      last_used_at = NULL
    WHERE site_admin_totp.confirmed_at IS NULL
    RETURNING admin_email
  ` as Array<{ admin_email: string }>;
  // A concurrently completed enrollment must never be replaced with a new
  // secret that the caller cannot safely confirm.
  if (rows.length !== 1) throw new Error("SITE_ADMIN_TOTP_ALREADY_ENROLLED");
  return { challenge, secret, provisioningUri: siteAdminTotpProvisioningUri(email, secret) };
}

export async function confirmSiteAdminTotpEnrollment(email: string, challenge: string, code: string, now = Date.now()) {
  requireStore(); await ensurePostgresSchema();
  const row = await selectTotp(email);
  if (!row || row.confirmed_at || !row.enrollment_challenge_hash || row.enrollment_challenge_hash !== hashEnrollmentChallenge(challenge)) return false;
  const counter = findSiteAdminTotpCounter(decryptedSecret(row), code, now);
  if (counter === null) return false;
  const rows = await getPostgresClient()`
    UPDATE site_admin_totp
    SET confirmed_at = ${now}, enrollment_challenge_hash = NULL, last_used_counter = ${counter}, last_used_at = ${now}
    WHERE admin_email = ${email}
      AND confirmed_at IS NULL
      AND enrollment_challenge_hash = ${hashEnrollmentChallenge(challenge)}
    RETURNING admin_email
  ` as Array<{ admin_email: string }>;
  return rows.length === 1;
}

export async function consumeSiteAdminTotpCode(email: string, code: string, now = Date.now()) {
  requireStore(); await ensurePostgresSchema();
  const row = await selectTotp(email);
  if (!row?.confirmed_at) return false;
  const counter = findSiteAdminTotpCounter(decryptedSecret(row), code, now);
  const lastUsedCounter = row.last_used_counter === null ? null : Number(row.last_used_counter);
  if (counter === null || !canConsumeSiteAdminTotpCounter(lastUsedCounter, counter)) return false;
  const rows = await getPostgresClient()`
    UPDATE site_admin_totp
    SET last_used_counter = ${counter}, last_used_at = ${now}
    WHERE admin_email = ${email}
      AND confirmed_at IS NOT NULL
      AND (last_used_counter IS NULL OR last_used_counter < ${counter})
    RETURNING admin_email
  ` as Array<{ admin_email: string }>;
  return rows.length === 1;
}

export async function cancelSiteAdminTotpEnrollment(email: string) {
  requireStore(); await ensurePostgresSchema();
  const rows = await getPostgresClient()`
    DELETE FROM site_admin_totp
    WHERE admin_email = ${email} AND confirmed_at IS NULL
    RETURNING admin_email
  ` as Array<{ admin_email: string }>;
  return rows.length === 1;
}

export async function resetSiteAdminTotp(email: string) {
  requireStore(); await ensurePostgresSchema();
  const rows = await getPostgresClient()`
    DELETE FROM site_admin_totp
    WHERE admin_email = ${email}
    RETURNING admin_email
  ` as Array<{ admin_email: string }>;
  return rows.length === 1;
}
