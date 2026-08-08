import { isAppLocale, type AppLocale } from "./app-locale.ts";

type DocumentReadyState = "loading" | "interactive" | "complete";

type AccountLocaleReconciliationInput = {
  accountLocale: unknown;
  currentLocale: AppLocale;
  documentReadyState: DocumentReadyState;
  applyLocale: (locale: AppLocale) => void;
  subscribeToLoad: (listener: () => void) => () => void;
};

const noCleanup = () => undefined;

/**
 * Avoids replacing the document while React is still receiving its initial
 * streamed Server Component boundaries. Account locale remains authoritative,
 * but the initial cross-locale navigation starts only after the document load.
 */
export function reconcileAccountLocaleAfterDocumentLoad({
  accountLocale,
  currentLocale,
  documentReadyState,
  applyLocale,
  subscribeToLoad,
}: AccountLocaleReconciliationInput) {
  if (!isAppLocale(accountLocale) || accountLocale === currentLocale) return noCleanup;

  if (documentReadyState === "complete") {
    applyLocale(accountLocale);
    return noCleanup;
  }

  let active = true;
  const unsubscribe = subscribeToLoad(() => {
    if (!active) return;
    active = false;
    applyLocale(accountLocale);
  });

  return () => {
    active = false;
    unsubscribe();
  };
}
