import type { GameGenerationMeta } from "./game-ai-types.ts";
import { PostgresVocabularyCatalogRepository } from "./vocabulary-catalog-repository.ts";
import { isVocabularyPostgresConfigured } from "./vocabulary-postgres-store.ts";
import { emitObservabilityEvent } from "./observability/index.ts";

const repository = new PostgresVocabularyCatalogRepository();

export async function submitDevelopmentVocabularyDraft(input: {
  kind: "word" | "definition" | "pair" | "group";
  payload: Record<string, unknown>;
  generation?: GameGenerationMeta;
  sourceReference?: string;
}) {
  if (process.env.APP_ENV !== "development" || !isVocabularyPostgresConfigured()) return null;
  try {
    return await repository.createDraft({
      kind: input.kind,
      payload: input.payload,
      provenance: {
        sourceType: input.generation ? "ai" : "manual",
        sourceEnvironment: "development",
        sourceReference: input.sourceReference,
        provider: input.generation?.provider,
        model: input.generation?.model,
        promptVersion: input.generation?.promptVersion,
      },
    });
  } catch {
    emitObservabilityEvent("error", "catalog.sync", {
      operation: "vocabulary-draft-submit",
      outcome: "failed",
      errorCode: "VOCABULARY_DRAFT_SUBMIT_FAILED",
    });
    return null;
  }
}
