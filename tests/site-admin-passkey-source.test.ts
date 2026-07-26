import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../lib/site-admin-passkey.ts", import.meta.url),
  "utf8",
);

test("admin passkey authentication lets the browser choose the available transport", () => {
  assert.match(
    source,
    /allowCredentials:\s*passkeys\.map\(\(passkey\) => \(\{ id: passkey\.credentialId \}\)\)/,
  );
  assert.doesNotMatch(
    source,
    /allowCredentials:[\s\S]*transports:\s*passkey\.credential\.transports/,
  );
});
