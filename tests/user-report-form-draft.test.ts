import assert from "node:assert/strict";
import test from "node:test";
import {
  loadUserReportFormDraft,
  saveUserReportFormDraft,
  userReportFormDraftStorageKey,
} from "../lib/user-report-form-draft.ts";

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

test("invalid or oversized report drafts are rejected or bounded", () => {
  const storage = new MemoryStorage();
  storage.setItem(userReportFormDraftStorageKey, "{");
  assert.equal(loadUserReportFormDraft(storage), null);

  storage.setItem(userReportFormDraftStorageKey, JSON.stringify({
    type: "bug",
    summary: "a".repeat(200),
    details: "b".repeat(2_000),
  }));
  const draft = loadUserReportFormDraft(storage);
  assert.equal(draft?.summary.length, 120);
  assert.equal(draft?.details.length, 1_200);
});
