export const currentTermsVersion = "2026-07-16";
export const currentPrivacyVersion = "2026-07-16";

export function legalConsentIsCurrent(input: { acceptedTerms?: boolean; termsVersion?: string; privacyVersion?: string }) {
  return input.acceptedTerms === true
    && input.termsVersion === currentTermsVersion
    && input.privacyVersion === currentPrivacyVersion;
}
