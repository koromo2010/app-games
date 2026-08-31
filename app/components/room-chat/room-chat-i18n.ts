import type { AppLocale } from "@/lib/app-locale";

const copy = {
  ja: { title: "ルームチャット", open: "チャット", close: "閉じる", placeholder: "メッセージを入力", send: "送信", participant: "参加者", degraded: "接続を確認中です。ゲームはそのまま続けられます。", empty: "まだメッセージはありません。" },
  en: { title: "Room chat", open: "Chat", close: "Close", placeholder: "Write a message", send: "Send", participant: "Participant", degraded: "Reconnecting to chat. You can keep playing.", empty: "No messages yet." },
} as const;

export function roomChatText(locale: AppLocale) { return copy[locale]; }
