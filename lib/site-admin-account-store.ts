import { randomBytes } from "node:crypto";
import { ensurePostgresSchema } from "@/lib/postgres-schema";
import { getPostgresClient, isPostgresConfigured } from "@/lib/postgres-store";
import {
  hashSiteAdminAccountPassword,
  isValidSiteAdminAccountPassword,
  isValidSiteAdminEmail,
  normalizeSiteAdminEmail,
  siteAdminAccountMaximumCount,
  verifySiteAdminAccountPassword,
} from "@/lib/site-admin-account-core";

export type SiteAdminAccountSummary = {
  email: string;
  receiveAlerts: boolean;
  receiveContacts: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SiteAdminNotificationKind = "alerts" | "contacts";

type SiteAdminAccountRow = {
  email: string;
  password_hash: string;
  password_salt: string;
  receive_alerts: boolean;
  receive_contacts: boolean;
  created_at: string | number;
  updated_at: string | number;
};

const dummySalt = "site-admin-account-not-found-v1";
const dummyHash = hashSiteAdminAccountPassword("not-a-valid-site-admin-password", dummySalt);

function requireStore() {
  if (!isPostgresConfigured()) throw new Error("SITE_ADMIN_ACCOUNTS_STORE_NOT_CONFIGURED");
}

function summary(row: Pick<SiteAdminAccountRow, "email" | "receive_alerts" | "receive_contacts" | "created_at" | "updated_at">): SiteAdminAccountSummary {
  return {
    email: row.email,
    receiveAlerts: Boolean(row.receive_alerts),
    receiveContacts: Boolean(row.receive_contacts),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function listSiteAdminAccounts() {
  requireStore();
  await ensurePostgresSchema();
  const rows = await getPostgresClient()`
    SELECT email, receive_alerts, receive_contacts, created_at, updated_at
    FROM site_admin_accounts
    ORDER BY created_at ASC
  ` as Array<Pick<SiteAdminAccountRow, "email" | "receive_alerts" | "receive_contacts" | "created_at" | "updated_at">>;
  return rows.map(summary);
}

export async function saveSiteAdminAccount(emailInput: string, password: string, subscriptions: { receiveAlerts: boolean; receiveContacts: boolean }) {
  requireStore();
  const email = normalizeSiteAdminEmail(emailInput);
  if (!isValidSiteAdminEmail(email)) throw new Error("SITE_ADMIN_EMAIL_INVALID");
  if (!isValidSiteAdminAccountPassword(password)) throw new Error("SITE_ADMIN_ACCOUNT_PASSWORD_INVALID");
  await ensurePostgresSchema();
  const sql = getPostgresClient();
  const existing = await sql`
    SELECT email FROM site_admin_accounts WHERE email = ${email} LIMIT 1
  ` as Array<{ email: string }>;
  if (!existing.length) {
    const count = await sql`SELECT COUNT(*)::int AS count FROM site_admin_accounts` as Array<{ count: number }>;
    if (Number(count[0]?.count ?? 0) >= siteAdminAccountMaximumCount) throw new Error("SITE_ADMIN_ACCOUNT_LIMIT_REACHED");
  }
  const now = Date.now();
  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashSiteAdminAccountPassword(password, salt);
  const rows = await sql`
    INSERT INTO site_admin_accounts (email, password_hash, password_salt, receive_alerts, receive_contacts, created_at, updated_at)
    VALUES (${email}, ${passwordHash}, ${salt}, ${subscriptions.receiveAlerts}, ${subscriptions.receiveContacts}, ${now}, ${now})
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      password_salt = EXCLUDED.password_salt,
      receive_alerts = EXCLUDED.receive_alerts,
      receive_contacts = EXCLUDED.receive_contacts,
      updated_at = EXCLUDED.updated_at
    RETURNING email, receive_alerts, receive_contacts, created_at, updated_at
  ` as Array<Pick<SiteAdminAccountRow, "email" | "receive_alerts" | "receive_contacts" | "created_at" | "updated_at">>;
  return summary(rows[0]!);
}

export async function updateSiteAdminAccountSubscriptions(emailInput: string, subscriptions: { receiveAlerts: boolean; receiveContacts: boolean }) {
  requireStore();
  const email = normalizeSiteAdminEmail(emailInput);
  if (!isValidSiteAdminEmail(email)) throw new Error("SITE_ADMIN_EMAIL_INVALID");
  await ensurePostgresSchema();
  const rows = await getPostgresClient()`
    UPDATE site_admin_accounts
    SET receive_alerts = ${subscriptions.receiveAlerts}, receive_contacts = ${subscriptions.receiveContacts}, updated_at = ${Date.now()}
    WHERE email = ${email}
    RETURNING email, receive_alerts, receive_contacts, created_at, updated_at
  ` as Array<Pick<SiteAdminAccountRow, "email" | "receive_alerts" | "receive_contacts" | "created_at" | "updated_at">>;
  if (!rows[0]) throw new Error("SITE_ADMIN_ACCOUNT_NOT_FOUND");
  return summary(rows[0]);
}

export async function listSiteAdminNotificationEmails(kind: SiteAdminNotificationKind) {
  requireStore();
  await ensurePostgresSchema();
  const sql = getPostgresClient();
  const rows = kind === "contacts"
    ? await sql`SELECT email FROM site_admin_accounts WHERE receive_contacts = TRUE ORDER BY created_at ASC`
    : await sql`SELECT email FROM site_admin_accounts WHERE receive_alerts = TRUE ORDER BY created_at ASC`;
  return (rows as Array<{ email: string }>).map((row) => row.email);
}

export async function verifySiteAdminAccount(emailInput: string, password: string) {
  requireStore();
  const email = normalizeSiteAdminEmail(emailInput);
  await ensurePostgresSchema();
  const rows = isValidSiteAdminEmail(email)
    ? await getPostgresClient()`
        SELECT email, password_hash, password_salt, created_at, updated_at
        FROM site_admin_accounts
        WHERE email = ${email}
        LIMIT 1
      ` as SiteAdminAccountRow[]
    : [];
  const account = rows[0];
  const matches = verifySiteAdminAccountPassword(
    password,
    account?.password_salt ?? dummySalt,
    account?.password_hash ?? dummyHash,
  );
  return Boolean(account && matches);
}

export async function deleteSiteAdminAccount(emailInput: string) {
  requireStore();
  const email = normalizeSiteAdminEmail(emailInput);
  if (!isValidSiteAdminEmail(email)) throw new Error("SITE_ADMIN_EMAIL_INVALID");
  await ensurePostgresSchema();
  const rows = await getPostgresClient()`
    DELETE FROM site_admin_accounts
    WHERE email = ${email}
    RETURNING email
  ` as Array<{ email: string }>;
  return rows.length > 0;
}
