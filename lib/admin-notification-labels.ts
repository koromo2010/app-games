export const adminNotificationErrorLabels: Record<string, string> = {
  EMAIL_SERVICE_NOT_CONFIGURED: "メール送信サービスが設定されていません",
  OPERATIONS_EMAIL_RECIPIENT_LOOKUP_FAILED: "管理者メールの取得に失敗しました",
  OPERATIONS_EMAIL_RECIPIENTS_NOT_CONFIGURED: "受信対象の管理者が見つかりません",
  EMAIL_PROVIDER_AUTH_FAILED: "メール送信サービスの認証に失敗しました",
  EMAIL_SENDER_NOT_VERIFIED: "送信元ドメインが未確認です",
  EMAIL_RECIPIENT_RESTRICTED: "宛先が送信制限の対象です",
  EMAIL_DELIVERY_QUOTA_EXCEEDED: "メール送信上限に達しました",
  EMAIL_DELIVERY_RATE_LIMITED: "メール送信が一時的に制限されています",
  EMAIL_SEND_FAILED: "メールサービスが送信を受理しませんでした",
};
