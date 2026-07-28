export type AiWordBulkEnrichmentInput = {
  schemaVersion: 1;
  enrichmentKey: string;
  enrichedBy: string;
  model: string;
  policyVersion: string;
  lexicalSourceVersion: string;
  expectedCount: number;
  generationBatchPrefixes: string[];
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

export function parseAiWordBulkEnrichmentInput(value: unknown): AiWordBulkEnrichmentInput {
  if (!value || typeof value !== "object") {
    throw new Error("AI_WORD_BULK_ENRICHMENT_OBJECT_REQUIRED");
  }
  const source = value as Partial<AiWordBulkEnrichmentInput>;
  if (source.schemaVersion !== 1) {
    throw new Error("AI_WORD_BULK_ENRICHMENT_SCHEMA_VERSION_UNSUPPORTED");
  }

  const enrichmentKey = cleanString(source.enrichmentKey);
  const enrichedBy = cleanString(source.enrichedBy);
  const model = cleanString(source.model);
  const policyVersion = cleanString(source.policyVersion);
  const lexicalSourceVersion = cleanString(source.lexicalSourceVersion);
  if (!enrichmentKey || !enrichedBy || !model || !policyVersion || !lexicalSourceVersion) {
    throw new Error("AI_WORD_BULK_ENRICHMENT_METADATA_REQUIRED");
  }
  if (!Number.isInteger(source.expectedCount) || Number(source.expectedCount) <= 0) {
    throw new Error("AI_WORD_BULK_ENRICHMENT_EXPECTED_COUNT_INVALID");
  }
  if (!Array.isArray(source.generationBatchPrefixes) || source.generationBatchPrefixes.length === 0) {
    throw new Error("AI_WORD_BULK_ENRICHMENT_BATCH_PREFIXES_REQUIRED");
  }
  const generationBatchPrefixes = [
    ...new Set(source.generationBatchPrefixes.map(cleanString).filter(Boolean)),
  ];
  if (generationBatchPrefixes.length !== source.generationBatchPrefixes.length) {
    throw new Error("AI_WORD_BULK_ENRICHMENT_BATCH_PREFIX_INVALID");
  }

  return {
    schemaVersion: 1,
    enrichmentKey,
    enrichedBy,
    model,
    policyVersion,
    lexicalSourceVersion,
    expectedCount: Number(source.expectedCount),
    generationBatchPrefixes,
  };
}

export function matchesAiWordBulkEnrichmentTarget(
  enrichment: AiWordBulkEnrichmentInput,
  generationBatchKey: string,
) {
  return enrichment.generationBatchPrefixes.some(
    (prefix) => generationBatchKey.startsWith(prefix),
  );
}
