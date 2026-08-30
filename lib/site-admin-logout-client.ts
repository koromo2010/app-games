export type SiteAdminLogoutFailureCode =
  | "DELETE_FAILED"
  | "DELETE_RESPONSE_INVALID"
  | "RECONCILIATION_FAILED"
  | "SESSION_STILL_AUTHENTICATED"
  | "TRANSPORT_FAILED";

export type SiteAdminLogoutResult =
  | { ok: true }
  | { ok: false; code: SiteAdminLogoutFailureCode };

type LogoutFetch = typeof fetch;

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === keys.length
    && actual.every((key, index) => key === expected[index]);
}

async function jsonOrNull(response: Response) {
  return await response.json().catch(() => null) as unknown;
}

export async function logoutSiteAdmin(
  fetcher: LogoutFetch = fetch,
): Promise<SiteAdminLogoutResult> {
  let deleted: Response;
  try {
    deleted = await fetcher("/api/admin/site-settings", { method: "DELETE" });
  } catch {
    return { ok: false, code: "TRANSPORT_FAILED" };
  }

  const deletePayload = await jsonOrNull(deleted);
  if (!deleted.ok) return { ok: false, code: "DELETE_FAILED" };
  if (!exactObject(deletePayload, ["ok"]) || deletePayload.ok !== true) {
    return { ok: false, code: "DELETE_RESPONSE_INVALID" };
  }

  let reconciled: Response;
  try {
    reconciled = await fetcher("/api/admin/site-settings", {
      method: "GET",
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "TRANSPORT_FAILED" };
  }

  const reconciliationPayload = await jsonOrNull(reconciled);
  if (reconciled.ok) {
    return { ok: false, code: "SESSION_STILL_AUTHENTICATED" };
  }
  if (
    reconciled.status !== 401
    || !exactObject(reconciliationPayload, ["error"])
    || reconciliationPayload.error !== "ADMIN_AUTH_REQUIRED"
  ) {
    return { ok: false, code: "RECONCILIATION_FAILED" };
  }
  return { ok: true };
}
