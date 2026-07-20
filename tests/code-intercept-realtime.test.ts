import assert from "node:assert/strict";
import test from "node:test";
import {
  codeInterceptPollingInterval,
  codeInterceptRealtimeChannel,
  codeInterceptRealtimePilotEnabled,
  codeInterceptRoomCodeFromRealtimeChannel,
} from "../lib/code-intercept-realtime-schema.ts";

test("Realtime pilot is limited to development and Vercel Preview", () => {
  assert.equal(codeInterceptRealtimePilotEnabled({ VERCEL_ENV: "preview", APP_ENV: "development" }), true);
  assert.equal(codeInterceptRealtimePilotEnabled({ VERCEL_ENV: "preview", APP_ENV: "development", CODE_INTERCEPT_REALTIME_ENABLED: "0" }), false);
  assert.equal(codeInterceptRealtimePilotEnabled({ APP_ENV: "development", CODE_INTERCEPT_REALTIME_ENABLED: "1" }), true);
  assert.equal(codeInterceptRealtimePilotEnabled({ VERCEL_ENV: "production", APP_ENV: "production", CODE_INTERCEPT_REALTIME_ENABLED: "1" }), false);
  assert.equal(codeInterceptRealtimePilotEnabled({ VERCEL_ENV: "production", APP_ENV: "development", CODE_INTERCEPT_REALTIME_ENABLED: "1" }), false);
});

test("Realtime channels only accept normalized four-character room codes", () => {
  assert.equal(codeInterceptRealtimeChannel("ab12"), "code-intercept:realtime:AB12");
  assert.equal(codeInterceptRoomCodeFromRealtimeChannel("code-intercept:realtime:AB12"), "AB12");
  assert.equal(codeInterceptRoomCodeFromRealtimeChannel("code-intercept:room:AB12"), null);
  assert.throws(() => codeInterceptRealtimeChannel("ABC"), /INVALID_CODE_INTERCEPT_REALTIME_CHANNEL/);
});

test("Connected realtime uses a 30 second safety poll and failures retain current polling", () => {
  assert.equal(codeInterceptPollingInterval({ realtimeEnabled: true, realtimeStatus: "connected", phase: "clue" }), 30_000);
  assert.equal(codeInterceptPollingInterval({ realtimeEnabled: true, realtimeStatus: "error", phase: "clue" }), 3_000);
  assert.equal(codeInterceptPollingInterval({ realtimeEnabled: true, realtimeStatus: "disconnected", phase: "lobby" }), 5_000);
  assert.equal(codeInterceptPollingInterval({ realtimeEnabled: false, realtimeStatus: "connected", phase: "answer" }), 3_000);
});
