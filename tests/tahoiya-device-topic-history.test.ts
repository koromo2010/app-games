import assert from "node:assert/strict";
import test from "node:test";
import {
  createTahoiyaDeviceTopicId,
  parseTahoiyaDeviceTopicHistory,
} from "../app/tahoiya/tahoiya-device-topic-history.ts";
import { getTahoiyaHistoryTopicId } from "../lib/tahoiya-topic-history-store.ts";

test("端末履歴はサーバー履歴と同じSHA-256 IDを作る", async () => {
  assert.equal(await createTahoiyaDeviceTopicId(" ＡＢＣ "), getTahoiyaHistoryTopicId("abc"));
});

test("端末履歴は有効なIDだけを重複なく100件まで保持する", () => {
  const ids = Array.from({ length: 101 }, (_, index) => getTahoiyaHistoryTopicId(`候補${index}`));
  const parsed = parseTahoiyaDeviceTopicHistory([ids[0], "invalid", ...ids]);
  assert.equal(parsed.length, 100);
  assert.equal(parsed[0], ids[0]);
  assert.equal(new Set(parsed).size, parsed.length);
});
