import assert from "node:assert/strict";
import test from "node:test";
import { sdkSupportThreadUrl } from "../lib/sdk-support-url.ts";

const reportId = "report_11111111-1111-4111-8111-111111111111";

test("support reply links use the development Portal for develop", () => {
  assert.equal(
    sdkSupportThreadUrl(
      "https://dev.game-fields.com/api/admin/user-reports",
      reportId,
      "develop",
    ),
    `https://sdk-dev.game-fields.com/support?thread=${reportId}`,
  );
});

test("support reply links use the production Portal for main", () => {
  assert.equal(
    sdkSupportThreadUrl(
      "https://www.game-fields.com/api/admin/user-reports",
      reportId,
      "main",
    ),
    `https://sdk.game-fields.com/support?thread=${reportId}`,
  );
});
