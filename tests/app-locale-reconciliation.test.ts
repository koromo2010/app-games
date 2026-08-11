import assert from "node:assert/strict";
import test from "node:test";
import { reconcileAccountLocaleAfterDocumentLoad } from "../lib/app-locale-reconciliation.ts";

function createLoadListenerHarness() {
  let listener: (() => void) | null = null;
  return {
    subscribe(nextListener: () => void) {
      listener = nextListener;
      return () => {
        listener = null;
      };
    },
    current() {
      return listener;
    },
    emit() {
      const registeredListener = listener;
      assert.ok(registeredListener);
      registeredListener();
    },
  };
}

test("初回documentのstream完了前はaccount locale再遷移をloadまで待つ", () => {
  const load = createLoadListenerHarness();
  const applied: string[] = [];

  const cancel = reconcileAccountLocaleAfterDocumentLoad({
    accountLocale: "ja",
    currentLocale: "en",
    documentReadyState: "interactive",
    applyLocale: (locale) => applied.push(locale),
    subscribeToLoad: load.subscribe,
  });

  assert.deepEqual(applied, []);
  load.emit();
  assert.deepEqual(applied, ["ja"]);

  cancel();
  assert.equal(load.current(), null);
});

test("document完了後のsession locale変更は即時反映する", () => {
  const applied: string[] = [];
  let subscribed = false;

  reconcileAccountLocaleAfterDocumentLoad({
    accountLocale: "en",
    currentLocale: "ja",
    documentReadyState: "complete",
    applyLocale: (locale) => applied.push(locale),
    subscribeToLoad: () => {
      subscribed = true;
      return () => undefined;
    },
  });

  assert.deepEqual(applied, ["en"]);
  assert.equal(subscribed, false);
});

test("load前に新しい状態へ切り替わった場合は古いlocaleを適用しない", () => {
  const load = createLoadListenerHarness();
  const applied: string[] = [];

  const cancel = reconcileAccountLocaleAfterDocumentLoad({
    accountLocale: "ja",
    currentLocale: "en",
    documentReadyState: "loading",
    applyLocale: (locale) => applied.push(locale),
    subscribeToLoad: load.subscribe,
  });

  const staleListener = load.current();
  assert.ok(staleListener);
  cancel();
  staleListener();
  assert.deepEqual(applied, []);
});

test("同一locale・不正localeでは再遷移を予約しない", () => {
  const applied: string[] = [];
  let subscriptions = 0;
  const subscribeToLoad = () => {
    subscriptions += 1;
    return () => undefined;
  };

  reconcileAccountLocaleAfterDocumentLoad({
    accountLocale: "ja",
    currentLocale: "ja",
    documentReadyState: "loading",
    applyLocale: (locale) => applied.push(locale),
    subscribeToLoad,
  });
  reconcileAccountLocaleAfterDocumentLoad({
    accountLocale: "fr",
    currentLocale: "ja",
    documentReadyState: "loading",
    applyLocale: (locale) => applied.push(locale),
    subscribeToLoad,
  });

  assert.deepEqual(applied, []);
  assert.equal(subscriptions, 0);
});
