export const emailDeliveryErrorCodes = [
  "EMAIL_PROVIDER_AUTH_FAILED",
  "EMAIL_SENDER_NOT_VERIFIED",
  "EMAIL_RECIPIENT_RESTRICTED",
  "EMAIL_DELIVERY_QUOTA_EXCEEDED",
  "EMAIL_DELIVERY_RATE_LIMITED",
  "EMAIL_SEND_FAILED",
] as const;

export type EmailDeliveryErrorCode = (typeof emailDeliveryErrorCodes)[number];

type EmailProviderError = {
  name?: unknown;
  message?: unknown;
};

function normalizedProviderMessage(error: EmailProviderError) {
  return typeof error.message === "string" ? error.message.toLowerCase() : "";
}

export function classifyEmailProviderError(error: EmailProviderError): EmailDeliveryErrorCode {
  const name = typeof error.name === "string" ? error.name : "";
  const message = normalizedProviderMessage(error);

  if (
    name === "missing_api_key"
    || name === "invalid_api_key"
    || name === "restricted_api_key"
    || name === "invalid_access"
  ) {
    return "EMAIL_PROVIDER_AUTH_FAILED";
  }
  if (name === "invalid_from_address") return "EMAIL_SENDER_NOT_VERIFIED";
  if (
    /domain.{0,80}(not verified|unverified)/.test(message)
    || /(verify|verified).{0,80}domain/.test(message)
  ) {
    return "EMAIL_SENDER_NOT_VERIFIED";
  }
  if (
    /testing emails?.{0,80}(your own|verified)/.test(message)
    || /only send.{0,80}(your own|verified email)/.test(message)
  ) {
    return "EMAIL_RECIPIENT_RESTRICTED";
  }
  if (name === "monthly_quota_exceeded" || name === "daily_quota_exceeded") {
    return "EMAIL_DELIVERY_QUOTA_EXCEEDED";
  }
  if (name === "rate_limit_exceeded") return "EMAIL_DELIVERY_RATE_LIMITED";
  return "EMAIL_SEND_FAILED";
}

export function emailDeliveryError(error: EmailProviderError) {
  return new Error(classifyEmailProviderError(error));
}

export function isEmailDeliveryError(error: unknown) {
  return error instanceof Error
    && emailDeliveryErrorCodes.includes(error.message as EmailDeliveryErrorCode);
}
