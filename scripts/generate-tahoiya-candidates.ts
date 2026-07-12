import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import {
  collectTahoiyaSourceBatchFromApis,
  hasVeryCommonSpokenHomophone,
  type TahoiyaSourceEntry,
} from "../lib/tahoiya-source-library.ts";

type Difficulty = "easy" | "standard" | "extreme";

type StoredCandidate = {
  word: string;
  reading: string;
  realDefinition: string;
  note: string;
  difficulty: Difficulty;
  difficultyReason: string;
  feedbackAnchorTags: string[];
  genre: string;
  sourceLibrary: string;
  sourceUrl: string;
  sourceEntryId: string;
  generatedAt: string;
  generation: {
    provider: "openai";
    model: string;
    mode: "paid";
    billingSource: "game-fields";
    promptVersion: string;
    latencyMs: number;
    retrievedFeedbackIds: string[];
  };
};

type CandidateFile = {
  schemaVersion: 1;
  updatedAt: string;
  reviewedSourceIds: string[];
  candidates: StoredCandidate[];
};

type ReviewItem = {
  sourceId: string;
  accepted: boolean;
  word?: string;
  reading?: string;
  realDefinition?: string;
  note?: string;
  difficulty?: Difficulty;
  difficultyReason?: string;
};

const promptVersion = "tahoiya-github-batch-v1";
const outputPath = path.resolve(process.cwd(), "data/tahoiya-candidates.json");

function readNumberArg(name: string, fallback: number) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  const value = Number.parseInt(raw || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeWord(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function anchorTags(difficulty: Difficulty) {
  if (difficulty === "easy") return ["too-easy", "common-or-homophone"];
  if (difficulty === "extreme") return ["too-hard", "hard-to-invent-fake-definition"];
  return ["just-right", "moderately-rare", "easy-to-invent-fake-definition"];
}

async function loadCandidateFile(): Promise<CandidateFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(outputPath, "utf8")) as Partial<CandidateFile>;
    return {
      schemaVersion: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      reviewedSourceIds: Array.isArray(parsed.reviewedSourceIds)
        ? parsed.reviewedSourceIds.filter((id): id is string => typeof id === "string")
        : [],
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates as StoredCandidate[] : [],
    };
  } catch {
    return { schemaVersion: 1, updatedAt: "", reviewedSourceIds: [], candidates: [] };
  }
}

async function saveCandidateFile(file: CandidateFile) {
  file.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

function parseReview(raw: string, sources: TahoiyaSourceEntry[]): ReviewItem[] {
  const json = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || raw;
  const parsed = JSON.parse(json) as { items?: ReviewItem[] } | ReviewItem[];
  const items = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(items) || items.length !== sources.length) {
    throw new Error(`AI returned ${items?.length ?? 0} reviews for ${sources.length} sources`);
  }
  const byId = new Map(items.map((item) => [item.sourceId, item]));
  return sources.map((source) => {
    const item = byId.get(source.id);
    if (!item) throw new Error(`AI omitted source ${source.id}`);
    return item;
  });
}

async function reviewBatch(client: OpenAI, model: string, sources: TahoiyaSourceEntry[]) {
  const input = sources.map((source) => ({
    sourceId: source.id,
    word: source.word,
    sourceLibrary: source.sourceLibrary,
  }));
  const prompt = `あなたは辞書当てゲーム「たほい屋」の語彙審査員です。候補10語を絶対評価してください。

重要:
- 説明候補は渡していません。見出し語そのものと一般知識だけで判定する。
- 日本語で実在・定着している専門語だけ採用。即席の翻訳、単なる英語・学名、一般名詞、固有名詞として有名すぎるもの、不確かな語は不採用。
- easy: 日常的・簡単、または読みが「亀・橋・雨・雲」のような非常に一般的な同音語になる。
- standard: RAGフィードバック基準の「ちょうどよい」。適度に珍しく、参加者が偽説明を作りやすい。
- extreme: 難しすぎ、参加者が偽説明すら作りにくい。
- 相対評価は禁止。10語すべてが同じ難易度でもよい。
- 採用語は自然な日本語表記、ひらがなの読み、正確な辞書的説明（60字以内）を作る。
- 同じ順序で全10件を返す。不採用でも sourceId と accepted は必須。

JSONのみ返す:
{"items":[{"sourceId":"...","accepted":true,"word":"...","reading":"...","realDefinition":"...","note":"...","difficulty":"easy|standard|extreme","difficultyReason":"絶対評価の理由"}]}

候補:
${JSON.stringify(input)}`;
  const startedAt = Date.now();
  const response = await client.responses.create({ model, input: prompt });
  return {
    items: parseReview(response.output_text, sources),
    latencyMs: Date.now() - startedAt,
  };
}

async function main() {
  const target = readNumberArg("target", 100);
  const maxBatches = readNumberArg("max-batches", Math.ceil(target / 10) * 4);
  const dryRun = process.argv.includes("--dry-run");
  const file = await loadCandidateFile();
  const reviewedIds = new Set(file.reviewedSourceIds);
  const words = new Set(file.candidates.map((candidate) => normalizeWord(candidate.word)));

  if (dryRun) {
    const sources = await collectTahoiyaSourceBatchFromApis({
      limit: 10,
      blockedSourceIds: [...reviewedIds],
      blockedWords: [...words],
    });
    console.log(JSON.stringify(sources.map(({ id, sourceRegistryId, word, sourceLibrary }) => ({
      id, sourceRegistryId, word, sourceLibrary,
    })), null, 2));
    if (sources.length < 10) process.exitCode = 1;
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  const model = process.env.TAHOIYA_GENERATOR_MODEL || "gpt-5.6-sol";
  const client = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 2 });
  console.log(`Starting Tahoiya generation: ${file.candidates.length}/${target}, model=${model}`);

  for (let batchNumber = 1; batchNumber <= maxBatches && file.candidates.length < target; batchNumber += 1) {
    const sources = await collectTahoiyaSourceBatchFromApis({
      limit: 10,
      blockedSourceIds: [...reviewedIds],
      blockedWords: [...words],
    });
    if (sources.length < 10) {
      console.warn(`[batch ${batchNumber}] only ${sources.length}/10 distinct sources; retrying`);
      continue;
    }

    let result: Awaited<ReturnType<typeof reviewBatch>> | null = null;
    for (let attempt = 1; attempt <= 3 && !result; attempt += 1) {
      try {
        result = await reviewBatch(client, model, sources);
      } catch (error) {
        console.warn(`[batch ${batchNumber}] review attempt ${attempt} failed`, error);
      }
    }
    if (!result) continue;

    const generatedAt = new Date().toISOString();
    let acceptedCount = 0;
    for (const source of sources) {
      reviewedIds.add(source.id);
      const item = result.items.find((candidate) => candidate.sourceId === source.id);
      if (!item?.accepted) continue;
      const word = cleanText(item.word, 80);
      const reading = cleanText(item.reading, 80);
      const realDefinition = cleanText(item.realDefinition, 60);
      const normalized = normalizeWord(word);
      if (!word || !reading || !realDefinition || words.has(normalized)) continue;
      const judged = item.difficulty === "easy" || item.difficulty === "extreme" ? item.difficulty : "standard";
      const difficulty: Difficulty = hasVeryCommonSpokenHomophone(reading) ? "easy" : judged;
      file.candidates.push({
        word,
        reading,
        realDefinition,
        note: cleanText(item.note, 120) || "専門語彙ライブラリから収集し、たほい屋向けに審査した語。",
        difficulty,
        difficultyReason: cleanText(item.difficultyReason, 180),
        feedbackAnchorTags: anchorTags(difficulty),
        genre: source.genre,
        sourceLibrary: source.sourceLibrary,
        sourceUrl: source.sourceUrl,
        sourceEntryId: source.id,
        generatedAt,
        generation: {
          provider: "openai",
          model,
          mode: "paid",
          billingSource: "game-fields",
          promptVersion,
          latencyMs: result.latencyMs,
          retrievedFeedbackIds: [],
        },
      });
      words.add(normalized);
      acceptedCount += 1;
      if (file.candidates.length >= target) break;
    }
    file.reviewedSourceIds = [...reviewedIds];
    await saveCandidateFile(file);
    console.log(`[batch ${batchNumber}] accepted ${acceptedCount}/10; total ${file.candidates.length}/${target}`);
  }

  if (file.candidates.length < target) {
    console.warn(`Stopped at ${file.candidates.length}/${target}. Re-run the workflow to continue from this file.`);
  } else {
    console.log(`Completed ${file.candidates.length}/${target} accepted candidates.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
