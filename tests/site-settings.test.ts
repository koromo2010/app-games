import assert from "node:assert/strict";
import test from "node:test";
import { createSiteAdminToken, parseSiteAdminToken, resolveSiteAdminPassword, verifySiteAdminPassword } from "../lib/site-admin-auth-core.ts";
import { defaultSiteSettings, isSiteIconUrl, normalizeSiteSettings, validateSiteSettingsInput } from "../lib/site-settings.ts";
import { isPngImage, isSiteIconImage, maxSiteIconUploadBytes } from "../lib/site-icon-image.ts";

test("site settings normalize missing and malformed saved values", () => {
  assert.deepEqual(normalizeSiteSettings(null), defaultSiteSettings);
  assert.deepEqual(normalizeSiteSettings({ siteName: "  My   Games  ", searchTitle: "検索タイトル", searchDescription: " 説明  文 ", iconUrl: null }), { siteName: "My Games", searchTitle: "検索タイトル", searchDescription: "説明 文", iconUrl: null, updatedAt: null });
});

test("site settings reject blank, oversized, and untrusted icon values", () => {
  assert.equal(validateSiteSettingsInput({ siteName: "", searchTitle: "title", searchDescription: "description", iconUrl: null }), "INVALID_TEXT");
  assert.equal(validateSiteSettingsInput({ siteName: "site", searchTitle: "x".repeat(71), searchDescription: "description", iconUrl: null }), "INVALID_TEXT");
  assert.equal(validateSiteSettingsInput({ siteName: "site", searchTitle: "title", searchDescription: "description", iconUrl: "https://example.com/icon.png" }), "INVALID_ICON_URL");
  assert.equal(isSiteIconUrl("https://example.public.blob.vercel-storage.com/site-icons/id.png"), true);
  assert.equal(isSiteIconUrl("https://example.public.blob.vercel-storage.com/avatars/id.png"), false);
});

test("site admin tokens are signed and expire", () => {
  const now = 1_000_000;
  const token = createSiteAdminToken("test-secret", now);
  assert.ok(parseSiteAdminToken(token, "test-secret", now));
  assert.equal(parseSiteAdminToken(`${token}x`, "test-secret", now), null);
  assert.equal(parseSiteAdminToken(token, "wrong-secret", now), null);
  assert.equal(parseSiteAdminToken(token, "test-secret", now + 13 * 60 * 60 * 1_000), null);
  assert.equal(verifySiteAdminPassword("password", "password"), true);
  assert.equal(verifySiteAdminPassword("wrong", "password"), false);
  assert.equal(resolveSiteAdminPassword({ SITE_ADMIN_PASSWORD: "site", DEBUG_MODE_PASSWORD: "debug" }), "site");
  assert.equal(resolveSiteAdminPassword({ DEBUG_MODE_PASSWORD: "debug" }), "debug");
});

test("site icon validation checks content signatures and limits", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(isPngImage(png), true);
  assert.equal(isSiteIconImage(png, "image/png"), true);
  assert.equal(isSiteIconImage(png, "image/jpeg"), false);
  assert.equal(isPngImage(new Uint8Array(maxSiteIconUploadBytes + 1)), false);
});
