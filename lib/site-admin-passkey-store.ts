import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AuthenticatorTransportFuture, Base64URLString, CredentialDeviceType, WebAuthnCredential } from "@simplewebauthn/server";
import { ensurePostgresSchema } from "@/lib/postgres-schema";
import { getPostgresClient, isPostgresConfigured } from "@/lib/postgres-store";
import type { SiteAdminSessionPayload } from "@/lib/site-admin-auth-core";

const maximumPasskeysPerAdmin = 5;
const recoveryCodeCount = 10;

type PasskeyRow = {
  credential_id: string;
  admin_email: string;
  public_key: string;
  counter: string | number;
  transports: AuthenticatorTransportFuture[];
  device_type: CredentialDeviceType;
  backed_up: boolean;
  created_at: string | number;
  last_used_at: string | number | null;
};

export type SiteAdminPasskey = {
  credentialId: Base64URLString;
  email: string;
  credential: WebAuthnCredential;
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

function requireStore() {
  if (!isPostgresConfigured()) throw new Error("SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED");
}

function fromRow(row: PasskeyRow): SiteAdminPasskey {
  return {
    credentialId: row.credential_id as Base64URLString,
    email: row.admin_email,
    credential: {
      id: row.credential_id as Base64URLString,
      publicKey: new Uint8Array(Buffer.from(row.public_key, "base64url")),
      counter: Number(row.counter),
      transports: row.transports,
    },
    deviceType: row.device_type,
    backedUp: row.backed_up,
    createdAt: Number(row.created_at),
    lastUsedAt: row.last_used_at === null ? null : Number(row.last_used_at),
  };
}

export async function listSiteAdminPasskeys(email: string) {
  requireStore(); await ensurePostgresSchema();
  const rows = await getPostgresClient()`
    SELECT * FROM site_admin_passkeys WHERE admin_email = ${email} ORDER BY created_at ASC
  ` as PasskeyRow[];
  return rows.map(fromRow);
}

export async function findSiteAdminPasskey(credentialId: string) {
  requireStore(); await ensurePostgresSchema();
  const rows = await getPostgresClient()`
    SELECT * FROM site_admin_passkeys WHERE credential_id = ${credentialId} LIMIT 1
  ` as PasskeyRow[];
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function saveSiteAdminPasskey(input: {
  email: string;
  credential: WebAuthnCredential;
  deviceType: CredentialDeviceType;
  backedUp: boolean;
}) {
  requireStore(); await ensurePostgresSchema();
  const sql = getPostgresClient();
  const count = await sql`SELECT COUNT(*)::int AS count FROM site_admin_passkeys WHERE admin_email = ${input.email}` as Array<{ count: number }>;
  if (Number(count[0]?.count ?? 0) >= maximumPasskeysPerAdmin) throw new Error("SITE_ADMIN_PASSKEY_LIMIT_REACHED");
  const now = Date.now();
  await sql`
    INSERT INTO site_admin_passkeys (credential_id, admin_email, public_key, counter, transports, device_type, backed_up, created_at, last_used_at)
    VALUES (${input.credential.id}, ${input.email}, ${Buffer.from(input.credential.publicKey).toString("base64url")}, ${input.credential.counter}, ${JSON.stringify(input.credential.transports ?? [])}::jsonb, ${input.deviceType}, ${input.backedUp}, ${now}, NULL)
    ON CONFLICT (credential_id) DO NOTHING
  `;
}

export async function updateSiteAdminPasskeyCounter(credentialId: string, counter: number) {
  requireStore(); await ensurePostgresSchema();
  await getPostgresClient()`
    UPDATE site_admin_passkeys SET counter = ${counter}, last_used_at = ${Date.now()} WHERE credential_id = ${credentialId}
  `;
}

function recoverySecret() {
  return process.env.PLAYER_SESSION_SECRET || process.env.LLM_SESSION_SECRET || process.env.SITE_ADMIN_PASSWORD || "local-site-admin-recovery-secret";
}

function normalizeRecoveryCode(code: string) { return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(); }
function hashRecoveryCode(code: string) { return createHmac("sha256", recoverySecret()).update(normalizeRecoveryCode(code)).digest("hex"); }
function newRecoveryCode() {
  const value = randomBytes(9).toString("base64url").replace(/[-_]/g, "A").toUpperCase().slice(0, 12);
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}

export async function replaceSiteAdminRecoveryCodes(email: string) {
  requireStore(); await ensurePostgresSchema();
  const sql = getPostgresClient();
  const codes = Array.from({ length: recoveryCodeCount }, newRecoveryCode);
  await sql`DELETE FROM site_admin_recovery_codes WHERE admin_email = ${email}`;
  const now = Date.now();
  for (const code of codes) {
    await sql`INSERT INTO site_admin_recovery_codes (code_hash, admin_email, created_at, used_at) VALUES (${hashRecoveryCode(code)}, ${email}, ${now}, NULL)`;
  }
  return codes;
}

export async function consumeSiteAdminRecoveryCode(email: string, code: string) {
  requireStore(); await ensurePostgresSchema();
  const rows = await getPostgresClient()`
    UPDATE site_admin_recovery_codes SET used_at = ${Date.now()}
    WHERE code_hash = ${hashRecoveryCode(code)} AND admin_email = ${email} AND used_at IS NULL
    RETURNING code_hash
  ` as Array<{ code_hash: string }>;
  return rows.length === 1;
}

function requestFingerprint(request: Request) {
  const source = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("user-agent") || "unknown";
  return createHmac("sha256", recoverySecret()).update(source).digest("base64url").slice(0, 24);
}

export async function appendSiteAdminAuditLog(request: Request, session: SiteAdminSessionPayload | null, action: string, target: string, beforeValue?: unknown, afterValue?: unknown) {
  if (!isPostgresConfigured()) return;
  try {
    await ensurePostgresSchema();
    await getPostgresClient()`
      INSERT INTO site_admin_audit_logs (id, actor_email, auth_method, action, target, before_value, after_value, request_fingerprint, created_at)
      VALUES (${randomUUID()}, ${session?.email ?? null}, ${session?.method ?? "unknown"}, ${action}, ${target}, ${beforeValue === undefined ? null : JSON.stringify(beforeValue)}::jsonb, ${afterValue === undefined ? null : JSON.stringify(afterValue)}::jsonb, ${requestFingerprint(request)}, ${Date.now()})
    `;
  } catch { /* Audit failures must not expose secrets or replace the primary response. */ }
}

export async function listSiteAdminAuditLogs(limit = 100) {
  requireStore(); await ensurePostgresSchema();
  return await getPostgresClient()`
    SELECT id, actor_email, auth_method, action, target, before_value, after_value, created_at
    FROM site_admin_audit_logs ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(200, limit))}
  ` as Array<{ id: string; actor_email: string | null; auth_method: string; action: string; target: string; before_value: unknown; after_value: unknown; created_at: string | number }>;
}
