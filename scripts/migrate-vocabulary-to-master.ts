import { redisCommand } from "../lib/redis-store.ts";
import { PostgresVocabularyCatalogRepository } from "../lib/vocabulary-catalog-repository.ts";

const repository = new PostgresVocabularyCatalogRepository();

type LegacyWordWolfRecord = {
  topic?: {
    villageWord?: string; wolfWord?: string; reason?: string; dictionarySource?: string;
    pairDistance?: string; sourceMode?: string; generation?: Record<string, unknown>;
  };
};
type LegacyTahoiyaRecord = {
  topic?: {
    word?: string; reading?: string; realDefinition?: string; note?: string;
    sourceDetail?: string; generation?: Record<string, unknown>;
  };
  difficulty?: string;
};

function generationFields(value: Record<string, unknown> | undefined) {
  return {
    provider: typeof value?.provider === "string" ? value.provider : null,
    model: typeof value?.model === "string" ? value.model : null,
    promptVersion: typeof value?.promptVersion === "string" ? value.promptVersion : null,
  };
}

async function migrateWordWolf() {
  const values = await redisCommand<string[]>(["HVALS", "wordwolf:topic:catalog:v1"]);
  let migrated = 0;
  for (const raw of Array.isArray(values) ? values : []) {
    const record = JSON.parse(raw) as LegacyWordWolfRecord;
    const topic = record.topic;
    if (!topic?.villageWord || !topic.wolfWord) continue;
    const generation = generationFields(topic.generation);
    await repository.createDraft({
      kind: "pair",
      payload: { gameId: "wordwolf", ...topic },
      provenance: {
        sourceType: topic.generation ? "ai" : "import",
        sourceEnvironment: "development",
        sourceReference: [topic.villageWord, topic.wolfWord].sort().join("::"),
        ...generation,
      },
    });
    migrated += 1;
  }
  return migrated;
}

async function migrateTahoiya() {
  const values = await redisCommand<string[]>(["HVALS", "tahoiya:topic:catalog:v1"]);
  let migrated = 0;
  for (const raw of Array.isArray(values) ? values : []) {
    const record = JSON.parse(raw) as LegacyTahoiyaRecord;
    const topic = record.topic;
    if (!topic?.word || !topic.realDefinition) continue;
    const generation = generationFields(topic.generation);
    await repository.createDraft({
      kind: "definition",
      payload: { gameId: "tahoiya", difficulty: record.difficulty, ...topic },
      provenance: {
        sourceType: topic.generation ? "ai" : "import",
        sourceEnvironment: "development",
        sourceReference: topic.word.normalize("NFKC").trim().toLocaleLowerCase("ja"),
        ...generation,
      },
    });
    migrated += 1;
  }
  return migrated;
}

if (process.env.APP_ENV !== "development") throw new Error("MIGRATION_REQUIRES_APP_ENV_DEVELOPMENT");
const [wordWolf, tahoiya] = await Promise.all([migrateWordWolf(), migrateTahoiya()]);
process.stdout.write(JSON.stringify({ wordWolf, tahoiya }) + "\n");
