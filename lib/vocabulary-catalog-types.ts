export type VocabularyStatus = "draft" | "reviewed" | "active" | "rejected" | "archived";
export type VocabularySourceType = "dictionary" | "manual" | "ai" | "user" | "import";
export type VocabularySourceEnvironment = "development" | "production" | "batch" | "admin";

export type VocabularyProvenance = {
  sourceType: VocabularySourceType;
  sourceEnvironment: VocabularySourceEnvironment;
  sourceReference?: string | null;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  generationBatchId?: string | null;
  createdBy?: string | null;
};

export type Word = {
  id: string;
  surface: string;
  reading: string | null;
  normalizedSurface: string;
  partOfSpeech: string | null;
  properNoun: boolean;
  characterCount: number;
  zipf: number | null;
  status: VocabularyStatus;
};

export type WordPair = {
  id: string;
  wordAId: string;
  wordBId: string;
  relation: string | null;
  difficulty: string | null;
  status: VocabularyStatus;
};

export type WordDefinition = {
  id: string;
  wordId: string;
  shortDefinition: string;
  status: VocabularyStatus;
};

export type VocabularyWordQuery = { gameId: string; limit: number; statuses?: VocabularyStatus[] };
export type VocabularyPairQuery = { gameId: string; limit: number; statuses?: VocabularyStatus[] };
export type VocabularyDefinitionQuery = { wordId: string; gameId?: string; statuses?: VocabularyStatus[] };

export interface VocabularyCatalogRepository {
  findWords(query: VocabularyWordQuery): Promise<Word[]>;
  findPairs(query: VocabularyPairQuery): Promise<WordPair[]>;
  findDefinitions(query: VocabularyDefinitionQuery): Promise<WordDefinition[]>;
  createDraft(input: {
    kind: "word" | "definition" | "pair" | "group";
    payload: Record<string, unknown>;
    provenance: VocabularyProvenance;
  }): Promise<string>;
}
