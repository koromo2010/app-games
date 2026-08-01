import assert from "node:assert/strict";
import test from "node:test";
import {
  loadUserReportFormDraft,
  saveUserReportFormDraft,
  userReportFormDraftStorageKey,
} from "../lib/user-report-form-draft.ts";
import { SUPPORT_TEXT_LIMITS } from "../config/support-text-contract.ts";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test("user report form draft survives a component remount in the same tab", () => {
  const storage = new MemoryStorage();
  saveUserReportFormDraft({
    type: "request",
    summary: "入力途中の概要",
    details: "ゲーム進行中に画面が切り替わっても残す",
  }, storage);

  assert.deepEqual(loadUserReportFormDraft(storage), {
    type: "request",
    summary: "入力途中の概要",
    details: "ゲーム進行中に画面が切り替わっても残す",
  });
});

test("empty report form removes the sent draft", () => {
  const storage = new MemoryStorage();
  storage.setItem(userReportFormDraftStorageKey, JSON.stringify({
    type: "bug",
    summary: "送信済み",
    details: "送信後は残さない",
  }));

  saveUserReportFormDraft({
    type: "bug",
    summary: "",
    details: "",
  }, storage);

  assert.equal(loadUserReportFormDraft(storage), null);
});

test("a submitted report keeps its request ID across a component remount", () => {
  const storage = new MemoryStorage();
  saveUserReportFormDraft({
    type: "bug",
    summary: "送信結果が不明",
    details: "同じ操作として再試行する",
    requestId: "11111111-1111-4111-8111-111111111111",
  }, storage);

  assert.equal(
    loadUserReportFormDraft(storage)?.requestId,
    "11111111-1111-4111-8111-111111111111",
  );
});

test("invalid or oversized report drafts are rejected without truncation", () => {
  const storage = new MemoryStorage();
  storage.setItem(userReportFormDraftStorageKey, "{");
  assert.equal(loadUserReportFormDraft(storage), null);

  const fullDetails = "b".repeat(SUPPORT_TEXT_LIMITS.details);
  assert.equal(saveUserReportFormDraft({
    type: "bug",
    summary: "上限内の概要",
    details: fullDetails,
  }, storage), true);
  assert.equal(loadUserReportFormDraft(storage)?.details, fullDetails);

  assert.equal(saveUserReportFormDraft({
    type: "bug",
    summary: "上限内の概要",
    details: `${fullDetails}x`,
  }, storage), false);
  assert.equal(
    loadUserReportFormDraft(storage)?.details,
    fullDetails,
    "an oversized edit must not replace the last complete draft",
  );

  storage.setItem(userReportFormDraftStorageKey, JSON.stringify({
    type: "bug",
    summary: "a".repeat(SUPPORT_TEXT_LIMITS.summary + 1),
    details: "invalid",
  }));
  assert.equal(loadUserReportFormDraft(storage), null);
});
