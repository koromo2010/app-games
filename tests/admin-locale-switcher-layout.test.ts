import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  globalLocaleSwitcherPlacement,
  unlocalizedAppPathname,
} from "../lib/locale-switcher-route.ts";

const read = (path: string) => readFileSync(path, "utf8");

test("locale-prefixed privileged routes select a non-overlay placement", () => {
  for (const locale of ["ja", "en"] as const) {
    assert.equal(unlocalizedAppPathname(`/${locale}/admin`), "/admin");
    assert.equal(globalLocaleSwitcherPlacement(`/${locale}/admin`), "hidden");
    assert.equal(globalLocaleSwitcherPlacement(`/${locale}/site-admin`), "site-admin-flow");
    assert.equal(
      globalLocaleSwitcherPlacement(`/${locale}/site-admin/runtime-operations/sdk-migration-011`),
      "site-admin-flow",
    );
    assert.equal(
      globalLocaleSwitcherPlacement(`/${locale}/site-admin/runtime-diagnostics/sdk-ledger`),
      "site-admin-flow",
    );
  }
});

test("public global switcher keeps its fixed and player-session visibility contract", () => {
  assert.equal(globalLocaleSwitcherPlacement("/ja/games"), "public-fixed");
  assert.equal(globalLocaleSwitcherPlacement("/en/play/tahoiya"), "public-fixed");

  const globalSwitcher = read("app/components/GlobalLocaleSwitcher.tsx");
  assert.match(globalSwitcher, /className="fixed right-3 top-3 z-\[100\]"/);
  assert.match(globalSwitcher, /<LocaleSwitcher hideWhenAuthenticated \/>/);
  assert.match(globalSwitcher, /data-locale-switcher-placement="site-admin-flow"/);
  assert.doesNotMatch(
    globalSwitcher.match(/placement === "site-admin-flow"[\s\S]*?\n  }/)?.[0] ?? "",
    /\bfixed\b|\babsolute\b|hideWhenAuthenticated/,
  );
});

test("admin locale and operational controls are independent responsive targets", () => {
  const panel = read("app/admin/SiteAdminPanel.tsx");
  const localeSwitcher = read("app/components/LocaleSwitcher.tsx");

  assert.match(panel, /sm:flex-row sm:items-center sm:justify-between/);
  assert.match(panel, /flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end/);
  assert.match(panel, /data-site-admin-header-actions/);
  assert.match(panel, /<LocaleSwitcher className="shrink-0" \/>/);
  assert.match(panel, /<form method="post" action=\{siteAdminLogoutPath\}>/);
  assert.match(panel, /<button type="submit"[^>]*>ログアウト<\/button>/);
  assert.match(panel, />Migration 011<\/Link>/);
  assert.match(panel, />サイトを見る<\/Link>/);
  assert.match(localeSwitcher, /aria-label=\{t\("locale\.switchLabel"\)\}/);
  assert.match(localeSwitcher, /<button[\s\S]*?type="button"[\s\S]*?onClick=\{\(\) => setLocale\(option\)\}/);
  assert.doesNotMatch(panel, /<LocaleSwitcher[^>]*hideWhenAuthenticated/);
  assert.doesNotMatch(panel, /fixed right-3 top-3|\babsolute\b/);
});

test("site-admin routes use one flow switcher while reconciliation panel avoids duplication", () => {
  const layout = read("app/layout.tsx");
  const reconciliation = read("app/site-admin/logout-reconciliation/page.tsx");

  assert.match(layout, /<GlobalLocaleSwitcher \/>/);
  assert.doesNotMatch(layout, /fixed right-3 top-3/);
  assert.match(reconciliation, /showInlineLocaleSwitcher=\{false\}/);
});
