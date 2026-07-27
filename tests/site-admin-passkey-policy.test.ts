import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSiteAdminPlatformPasskeyRegistration,
  isInternalSiteAdminPasskeyTransport,
} from "../lib/site-admin-passkey-policy.ts";

test("site admin passkey policy accepts only an internal platform authenticator", () => {
  assert.equal(isInternalSiteAdminPasskeyTransport(["internal"]), true);
  assert.equal(isInternalSiteAdminPasskeyTransport(["hybrid", "internal"]), true);
  assert.equal(isInternalSiteAdminPasskeyTransport(["usb"]), false);
  assert.doesNotThrow(() => assertSiteAdminPlatformPasskeyRegistration({
    authenticatorAttachment: "platform",
    transports: ["internal"],
  }));
});

test("site admin passkey policy rejects USB, cross-platform, and unclassified registrations", () => {
  for (const input of [
    { authenticatorAttachment: "cross-platform" as const, transports: ["usb"] },
    { authenticatorAttachment: "cross-platform" as const, transports: ["internal"] },
    { authenticatorAttachment: "platform" as const, transports: ["usb"] },
    { authenticatorAttachment: "platform" as const, transports: [] },
    { authenticatorAttachment: undefined, transports: undefined },
  ]) {
    assert.throws(
      () => assertSiteAdminPlatformPasskeyRegistration(input),
      /SITE_ADMIN_PLATFORM_PASSKEY_REQUIRED/,
    );
  }
});
