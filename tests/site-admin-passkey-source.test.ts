import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../lib/site-admin-passkey.ts", import.meta.url),
  "utf8",
);

test("admin passkey registration requires a discoverable local credential", () => {
  assert.match(source, /preferredAuthenticatorType:\s*"localDevice"/);
  assert.match(
    source,
    /authenticatorSelection:\s*\{\s*residentKey:\s*"required",\s*userVerification:\s*"required"\s*\}/,
  );
});

test("admin passkey authentication uses registered credentials through Windows Hello", () => {
  assert.match(
    source,
    /allowCredentials:\s*passkeys\.map[\s\S]*id:\s*passkey\.credentialId/,
  );
  assert.match(
    source,
    /allowCredentials:[\s\S]*transports:\s*\["internal"\]/,
  );
  assert.doesNotMatch(source, /transports:\s*passkey\.credential\.transports/);
  assert.match(source, /passkey\.email !== email/);
});
