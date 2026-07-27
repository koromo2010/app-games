import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(
  new URL("../app/api/admin/passkeys/route.ts", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../lib/site-admin-passkey-client.ts", import.meta.url),
  "utf8",
);
const accountsSource = readFileSync(
  new URL("../app/admin/AdminAccountsPanel.tsx", import.meta.url),
  "utf8",
);

test("recovery codes support login and authenticated step-up purposes only", () => {
  assert.match(
    routeSource,
    /challenge\.purpose !== "login" && challenge\.purpose !== "step-up"/,
  );
  assert.match(
    routeSource,
    /challenge\.purpose === "step-up"[\s\S]*requireFullSiteAdminSession\(\)[\s\S]*current\.email !== challenge\.email/,
  );
  assert.ok(
    routeSource.indexOf("requireFullSiteAdminSession()")
      < routeSource.indexOf("consumeSiteAdminRecoveryCode(challenge.email, body.recoveryCode)"),
  );
});

test("recovery-code step-up returns and validates the new full session", () => {
  assert.match(
    clientSource,
    /data\.session\.scope !== "full" \|\| data\.session\.method !== "recovery-code"/,
  );
  assert.match(clientSource, /return await completeStepUpWithRecoveryCode\(\)/);
  assert.match(accountsSource, /stepUpSession\?\.method === "recovery-code"/);
  assert.match(accountsSource, /onRecoveryCodeSessionEstablished\(\)/);
});
