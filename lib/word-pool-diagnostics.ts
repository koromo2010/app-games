import { emitObservabilityEvent } from "./observability/logger.ts";
import { vocabularyDatabaseErrorCode } from "./vocabulary-postgres-store.ts";

/** Closed codes only: never derive log text from an external exception message. */
export function reportWordPoolFailure(
  operation: "reviewed-query" | "legacy-query" | "history-read" | "draw",
  kind: "configuration" | "database" | "history" | "candidates",
  error?: unknown,
) {
  const databaseCode = kind === "database" ? vocabularyDatabaseErrorCode(error) : undefined;
  const errorCode = kind === "configuration" ? "WORD_POOL_NOT_CONFIGURED"
    : kind === "history" ? "WORD_POOL_HISTORY_READ_FAILED"
    : kind === "candidates" ? "WORD_POOL_CANDIDATES_INSUFFICIENT"
    : databaseCode === "42501" || databaseCode?.startsWith("28") ? "WORD_POOL_DATABASE_ACCESS_FAILED"
    : databaseCode?.startsWith("42") ? "WORD_POOL_DATABASE_SCHEMA_FAILED"
    : databaseCode?.startsWith("08") ? "WORD_POOL_DATABASE_CONNECTION_FAILED"
    : "WORD_POOL_DATABASE_QUERY_FAILED";
  emitObservabilityEvent("error", "word.pool", {
    game: "general-word-pool", operation, outcome: "failed", errorCode, databaseCode,
  });
}
