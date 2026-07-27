import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../lib/site-admin-passkey.ts", import.meta.url),
  "utf8",
);

test("admin passkey registration requires a discoverable local credential", () => {
  const selection = source.match(/authenticatorSelection:\s*\{([\s\S]*?)\n\s*\},/)?.[1] ?? "";
  assert.match(selection, /authenticatorAttachment:\s*"platform"/);
  assert.match(selection, /residentKey:\s*"required"/);
  assert.match(selection, /userVerification:\s*"required"/);
  assert.doesNotMatch(source, /preferredAuthenticatorType/);
});

test("admin passkey authentication identifies credentials without pinning USB transport", () => {
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
