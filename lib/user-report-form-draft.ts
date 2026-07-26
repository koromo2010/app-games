export type UserReportFormType = "bug" | "request";

export type UserReportFormDraft = {
  type: UserReportFormType;
  summary: string;
  details: string;
};

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const userReportFormDraftStorageKey =
  "game-fields:user-report-form-draft:v1";

function resolveDraftStorage(storage?: DraftStorage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeUserReportFormDraft(
  value: unknown,
): UserReportFormDraft | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<UserReportFormDraft>;
  if (input.type !== "bug" && input.type !== "request") return null;
  if (typeof input.summary !== "string" || typeof input.details !== "string") {
    return null;
  }
  return {
    type: input.type,
    summary: input.summary.slice(0, 120),
    details: input.details.slice(0, 1_200),
  };
}

export function loadUserReportFormDraft(
  storage?: DraftStorage,
): UserReportFormDraft | null {
  const resolvedStorage = resolveDraftStorage(storage);
  if (!resolvedStorage) return null;
  try {
    const value = resolvedStorage.getItem(userReportFormDraftStorageKey);
    return value
      ? normalizeUserReportFormDraft(JSON.parse(value) as unknown)
      : null;
  } catch {
    return null;
  }
}

export function saveUserReportFormDraft(
  draft: UserReportFormDraft,
  storage?: DraftStorage,
) {
  const resolvedStorage = resolveDraftStorage(storage);
  if (!resolvedStorage) return;
  try {
    if (!draft.summary && !draft.details) {
      resolvedStorage.removeItem(userReportFormDraftStorageKey);
      return;
    }
    resolvedStorage.setItem(userReportFormDraftStorageKey, JSON.stringify(draft));
  } catch {
    // Storage can be unavailable in restricted browser contexts. Reporting
    // must remain usable even when draft persistence cannot be enabled.
  }
}
