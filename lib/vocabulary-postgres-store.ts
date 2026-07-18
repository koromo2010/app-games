import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { canWriteVocabularyDrafts } from "./storage-environment-guard.ts";

let client: NeonQueryFunction<boolean, boolean> | null = null;
let clientUrl = "";

export function isVocabularyPostgresConfigured() {
  return Boolean(process.env.VOCABULARY_DATABASE_URL?.trim());
}

export function getVocabularyPostgresClient() {
  const url = process.env.VOCABULARY_DATABASE_URL?.trim();
  if (!url) throw new Error("VOCABULARY_STORE_NOT_CONFIGURED");
  if (!client || clientUrl !== url) {
    client = neon(url);
    clientUrl = url;
  }
  return client;
}

/** PostgreSQL SQLSTATE is safe to emit and identifies schema/permission failures without query data. */
export function vocabularyDatabaseErrorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

export function assertVocabularyDraftWriteAllowed() {
  if (!canWriteVocabularyDrafts()) throw new Error("VOCABULARY_DRAFT_WRITE_NOT_ALLOWED");
}
