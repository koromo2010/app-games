import { readFileSync } from "node:fs";
import { join } from "node:path";

function text(path) {
  return readFileSync(path, "utf8");
}

export function inspectPromotionReadiness(input) {
  const issues = [];
  const clientJavaScript = text(join(input.root, "mock/mock.js"));
  const appSetSource = text(join(input.root, "src/app-set.ts"));
  const contractTests = text(join(input.root, "tests/game-contract.test.ts"));
  if (input.previewManifest.gameId !== input.serverModule.manifest.id) {
    issues.push({
      code: "GAME_SDK_PACKAGE_GAME_ID_MISMATCH",
      location: "mock/preview.json, src/manifest.ts",
      message: `mock=${String(input.previewManifest.gameId)} appSet=${String(input.serverModule.manifest.id)}`,
    });
  }
  if (input.serverModule.manifest.playMode !== "online-room") {
    issues.push({
      code: "GAME_SDK_PACKAGE_PLAY_MODE_UNSUPPORTED",
      location: "src/manifest.ts",
      message: "昇格可能packageはonline-room AppSetを必要とします。",
    });
  }
  if (
    !/\bGameFieldsRoom\b/.test(clientJavaScript)
    || !/GameFieldsRoom\.subscribe\s*\(/.test(clientJavaScript)
    || !/GameFieldsRoom\.send\s*\(/.test(clientJavaScript)
  ) {
    issues.push({
      code: "GAME_SDK_CLIENT_ROOM_BRIDGE_MISSING",
      location: "mock/mock.js",
      message: "画面はGameFieldsRoomのsnapshotとCommandへ接続してください。",
    });
  }
  if (
    /\bGameFieldsPreset(?:\?\.|\.)resources\b/.test(clientJavaScript)
    || /\.resources\??\.(?:contentSource|llm)\b/.test(clientJavaScript)
  ) {
    issues.push({
      code: "GAME_SDK_CLIENT_RESOURCE_BRIDGE_FORBIDDEN",
      location: "mock/mock.js",
      message: "Word DBとLLMはブラウザではなくAppSetのcontext.resourcesから呼びます。",
    });
  }
  if (/\bGameFieldsPreset(?:\?\.|\.)registerGame\s*\(/.test(clientJavaScript)) {
    issues.push({
      code: "GAME_SDK_CLIENT_LOCAL_GAME_ADAPTER_FORBIDDEN",
      location: "mock/mock.js",
      message: "start/abort/rematchをブラウザ状態へ接続せず、AppSetのRoom stateを正本にしてください。",
    });
  }
  if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*(?:\(|\.)/.test(clientJavaScript)) {
    issues.push({
      code: "GAME_SDK_CLIENT_EXTERNAL_NETWORK_FORBIDDEN",
      location: "mock/mock.js",
      message: "クライアントから外部通信せず、GameFieldsRoomのViewとCommandだけを使ってください。",
    });
  }
  if (/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(clientJavaScript)) {
    issues.push({
      code: "GAME_SDK_CLIENT_LOCAL_STATE_FORBIDDEN",
      location: "mock/mock.js",
      message: "ブラウザ保存領域をゲーム状態の正本にしないでください。",
    });
  }
  if (/\b(?:fetch|process\.env|DATABASE_URL|REDIS_URL|BLOB_READ_WRITE_TOKEN)\b/.test(appSetSource)) {
    issues.push({
      code: "GAME_SDK_APP_SET_PLATFORM_ACCESS_FORBIDDEN",
      location: "src/app-set.ts",
      message: "AppSetはPlatform資源へ直接接続せず、context.resourcesだけを使ってください。",
    });
  }
  const timeLimitSettings = (input.serverModule.manifest.settings ?? [])
    .filter((setting) => setting.platformRole === "time-limit");
  if (timeLimitSettings.length !== 1) {
    issues.push({
      code: "GAME_SDK_TIME_LIMIT_CONTRACT_REQUIRED",
      location: "src/manifest.ts",
      message: "online-room packageはtime-limit roleのsettingを1件だけ宣言してください。",
    });
  }
  for (const marker of ["HOST_REQUIRED", "STALE_REVISION", "view.common", "assert.rejects"]) {
    if (!contractTests.includes(marker)) {
      issues.push({
        code: "GAME_SDK_CONTRACT_TEST_COVERAGE_MISSING",
        location: "tests/game-contract.test.ts",
        message: `必須契約テストの証跡「${marker}」がありません。`,
      });
    }
  }
  return issues;
}

export function assertPromotionReady(input) {
  const issues = inspectPromotionReadiness(input);
  if (issues.length === 0) return;
  const error = new Error("GAME_SDK_PROMOTION_READINESS_FAILED");
  error.issues = issues;
  throw error;
}
