import { GameSdkHttpClientRuntimeError } from "@game-fields/game-sdk/client-runtime";
import type { PackageRoom } from "./game-sdk-frame-types.ts";

export const panel =
  "rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-xl shadow-black/10";
export const primary =
  "rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-45";
export const secondary =
  "rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45";

export function randomRoomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0]!.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

export function errorMessage(error: unknown, preview: boolean) {
  if (error instanceof GameSdkHttpClientRuntimeError) {
    if (error.status === 401) {
      return preview
        ? "SDK PortalからPreview認証を更新してください。"
        : "ログイン状態の有効期限が切れました。ログインし直してください。";
    }
    if (error.code === "STALE_REVISION") return "部屋を最新状態へ更新しました。";
    if (error.code === "DEBUG_AUTO_PROGRESS_UNSUPPORTED") {
      return "このPackageには安全な自動進行処理がありません。";
    }
    if (error.code === "DEBUG_AUTO_PROGRESS_LIMIT") {
      return "自動進行の安全上限に達しました。現在の状態から操作を確認してください。";
    }
    if (error.code === "GAME_SDK_REMOTE_RUNNER_AUTH_FAILED") {
      return "ゲーム実行サーバーの認証設定が一致していません。運営へ報告してください。";
    }
    if (error.code === "GAME_SDK_REMOTE_RUNNER_UNAVAILABLE") {
      return "ゲーム実行サーバーへ接続できません。少し待ってから、もう一度お試しください。";
    }
    if (error.code === "GAME_SDK_ACTIVE_ROOM_REPLACEMENT_FORBIDDEN") {
      return "参加中Roomの固定revisionを再確認できなかったため、新Roomを作成していません。";
    }
    if (
      error.code === "ROOM_RUNTIME_MISMATCH"
      || error.code === "SDK_PREVIEW_PACKAGE_NOT_AVAILABLE"
      || error.code === "GAME_SDK_RUNTIME_CATALOG_UNAVAILABLE"
    ) {
      return "Room固定revisionのpackageを取得できないため、clientの読込を停止しました。旧Mockや別revisionへは切り替えていません。";
    }
    return `操作を完了できませんでした（${error.code}）。`;
  }
  if (
    error instanceof Error
    && error.message === "GAME_SDK_PACKAGE_REVISION_MISMATCH"
  ) {
    return "Room固定revisionと読み込むclient revisionが一致しないため、操作を停止しました。";
  }
  if (
    error instanceof Error
    && error.message === "DEBUG_AUTO_PROGRESS_LIMIT"
  ) {
    return "自動進行の安全上限に達しました。現在の状態から操作を確認してください。";
  }
  return "操作を完了できませんでした。";
}

export function appPhase(room: PackageRoom | null) {
  const app = room?.view.app;
  if (!app || typeof app !== "object" || !("phase" in app)) return null;
  const phase = (app as { phase?: unknown }).phase;
  return typeof phase === "string" && phase.trim() ? phase : null;
}
