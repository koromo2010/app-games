import assert from "node:assert/strict";
import test from "node:test";
import { isTerminalOnlineRoomFetchError } from "../lib/online-room-fetch-policy.ts";

test("一時的な取得失敗では部屋から退出扱いにしない", () => {
  assert.equal(isTerminalOnlineRoomFetchError(new TypeError("network failed")), false);
  assert.equal(isTerminalOnlineRoomFetchError({ status: 500 }), false);
  assert.equal(isTerminalOnlineRoomFetchError({ status: 403 }), true);
  assert.equal(isTerminalOnlineRoomFetchError({ status: 404 }), true);
});
