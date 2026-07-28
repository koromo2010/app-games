import type { AppLocale } from "./app-locale.ts";

export const authGateMessages = {
  ja: {
    "locale.switchLabel": "表示言語を選択",
    "authGate.loginRequired": "このゲームを遊ぶにはログインが必要です。",
    "authGate.continueToLobby": "ログインすると、このままゲームラウンジを開きます。",
  },
  en: {
    "locale.switchLabel": "Choose display language",
    "authGate.loginRequired": "Sign in to play this game.",
    "authGate.continueToLobby": "After signing in, the game lounge will open automatically.",
  },
} as const;

export type AuthGateMessageKey = keyof typeof authGateMessages.ja;

export function translateAuthGate(locale: AppLocale, key: AuthGateMessageKey) {
  return authGateMessages[locale][key];
}
