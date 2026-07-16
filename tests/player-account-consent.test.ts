import assert from "node:assert/strict";
import test from "node:test";
import { currentPrivacyVersion, currentTermsVersion, legalConsentIsCurrent } from "../lib/legal.ts";

test("アカウント作成は現行TC・PPへの明示同意を必須にする", () => {
  assert.equal(legalConsentIsCurrent({}), false);
  assert.equal(legalConsentIsCurrent({ acceptedTerms: true, termsVersion: currentTermsVersion, privacyVersion: "old" }), false);
  assert.equal(legalConsentIsCurrent({ acceptedTerms: true, termsVersion: currentTermsVersion, privacyVersion: currentPrivacyVersion }), true);
});
