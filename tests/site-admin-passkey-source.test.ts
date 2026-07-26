import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../lib/site-admin-passkey.ts", import.meta.url),
  "utf8",
);

test("admin passkey authentication uses only credentials registered in this environment", () => {
  assert.match(source, /preferredAuthenticatorType:\s*"localDevice"/);
  assert.match(
    source,
    /allowCredentials:\s*passkeys\.map[\s\S]*id:\s*passkey\.credentialId/,
  );
  assert.doesNotMatch(
    source,
    /allowCredentials:[\s\S]*transports:\s*passkey\.credential\.transports/,
  );
  assert.match(source, /passkey\.email !== email/);
});
