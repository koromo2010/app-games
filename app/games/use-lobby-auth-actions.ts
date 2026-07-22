import { useState, type Dispatch, type SetStateAction } from "react";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { currentPrivacyVersion, currentTermsVersion } from "@/lib/legal";
import type { AppLocale } from "@/lib/app-locale";
import type { PlayerSession } from "@/lib/player-session";
import type { LobbyAuthMode } from "./LobbyAccountPanel";

const errors: Record<AppLocale, Record<string, string>> = {
  ja: { INVALID_JSON: "入力内容を読み取れませんでした。", TERMS_REQUIRED: "利用規約とプライバシーポリシーへの同意が必要です。", STORE_NOT_CONFIGURED: "プレイヤー保存用ストレージが未設定です。", NAME_REQUIRED: "プレイヤー名を入力してください。", PASSWORD_INVALID: "パスワードは4文字以上128文字以内で入力してください。", ALREADY_EXISTS: "そのプレイヤー名はすでに使われています。", EMAIL_INVALID: "メールアドレスの形式を確認してください。", EMAIL_ALREADY_EXISTS: "そのメールアドレスは別のアカウントで使われています。", INVALID_CREDENTIALS: "プレイヤー名またはパスワードが違います。", UNKNOWN: "アカウント処理に失敗しました。", AUTH_NOT_CONFIGURED: "ログイン認証用のサーバー設定が未完了です。" },
  en: { INVALID_JSON: "The request could not be read.", TERMS_REQUIRED: "You must agree to the Terms of Service and Privacy Policy.", STORE_NOT_CONFIGURED: "Player storage is not configured.", NAME_REQUIRED: "Enter a player name.", PASSWORD_INVALID: "Use a password between 4 and 128 characters.", ALREADY_EXISTS: "That player name is already in use.", EMAIL_INVALID: "Check the email address format.", EMAIL_ALREADY_EXISTS: "That email address is already used by another account.", INVALID_CREDENTIALS: "The player name or password is incorrect.", UNKNOWN: "The account request failed.", AUTH_NOT_CONFIGURED: "Server authentication is not configured." },
};

const authMessage = (code: unknown, locale: AppLocale) => typeof code === "string" ? errors[locale][code] ?? errors[locale].UNKNOWN : errors[locale].UNKNOWN;
type Setter = Dispatch<SetStateAction<string>>;
type Params = { name: string; password: string; email: string; resetEmail: string; authMode: LobbyAuthMode; legalAccepted: boolean; avatarColor: string; avatarImage: string | null; applySession: (session: PlayerSession) => void; setMessage: Setter; setPassword: Setter; setEmail: Setter; setResetEmail: Setter; setShowPasswordReset: Dispatch<SetStateAction<boolean>>; onAuthenticated?: () => void };

export function useLobbyAuthActions(params: Params) {
  const { locale, t } = useAppLocale();
  const [isSaving, setIsSaving] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const submitAccount = async () => {
    setIsSaving(true); params.setMessage("");
    try {
      const response = await fetch("/api/player-account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: params.authMode, name: params.name.trim(), password: params.password, email: params.authMode === "register" ? params.email : undefined, avatarColor: params.avatarColor, avatarImage: params.avatarImage, acceptedTerms: params.authMode === "register" ? params.legalAccepted : undefined, termsVersion: params.authMode === "register" ? currentTermsVersion : undefined, privacyVersion: params.authMode === "register" ? currentPrivacyVersion : undefined }) });
      const data = await response.json() as { session?: PlayerSession; error?: string };
      if (!response.ok || !data.session) return params.setMessage(authMessage(data.error, locale));
      params.applySession(data.session); params.setPassword(""); params.setEmail("");
      params.setMessage(params.authMode === "register" ? t("account.registerSuccess") : t("account.loginSuccess"));
      params.onAuthenticated?.();
    } catch { params.setMessage(t("account.networkError")); } finally { setIsSaving(false); }
  };
  const requestPasswordReset = async () => {
    setIsRequestingReset(true); params.setMessage("");
    try {
      const response = await fetch("/api/player-password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", email: params.resetEmail }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) return params.setMessage(locale === "en" ? (data.error === "EMAIL_NOT_CONFIGURED" ? "Email delivery is not configured yet. Contact the administrator." : "Could not send the reset email. Please try again later.") : (data.error === "EMAIL_NOT_CONFIGURED" ? "メール送信機能がまだ設定されていません。管理者に連絡してください。" : "再設定メールの送信処理に失敗しました。時間をおいて再度お試しください。"));
      params.setMessage(locale === "en" ? "If the address is registered, a password reset email has been sent." : "登録済みのメールアドレスであれば、再設定用メールを送信しました。");
      params.setShowPasswordReset(false); params.setResetEmail("");
    } catch { params.setMessage(t("account.networkError")); } finally { setIsRequestingReset(false); }
  };
  return { isSaving, isRequestingReset, submitAccount, requestPasswordReset };
}
