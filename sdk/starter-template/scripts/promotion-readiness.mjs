import { readFileSync } from "node:fs";
import { join } from "node:path";

function text(path) {
  return readFileSync(path, "utf8");
}

export function inspectPromotionReadiness(input) {
  const issues = [];
  const clientJavaScript = text(join(input.root, "mock/mock.js"));
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
    && !/\bGameFieldsPreset\.room\b/.test(clientJavaScript)
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
  return issues;
}

export function assertPromotionReady(input) {
  const issues = inspectPromotionReadiness(input);
  if (issues.length === 0) return;
  const error = new Error("GAME_SDK_PROMOTION_READINESS_FAILED");
  error.issues = issues;
  throw error;
}
