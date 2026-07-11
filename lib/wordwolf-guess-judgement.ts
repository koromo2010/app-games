import { redisCommand } from "@/lib/redis-store";
import { normalizeGuess } from "@/lib/wordwolf";

export type WordWolfGuessJudgementSource = "exact" | "feedback" | "llm" | "fuzzy";

export type WordWolfGuessJudgement = {
  accepted: boolean;
  source: WordWolfGuessJudgementSource;
  reason: string;
  confidence: number;
  feedbackAccepted: number;
  feedbackRejected: number;
};

type FeedbackRecord = {
  accepted: number;
  rejected: number;
  updatedAt: number;
};

const feedbackKeyPrefix = "wordwolf:guess-feedback:";

function feedbackKey(correctWord: string, guessWord: string) {
  return feedbackKeyPrefix + normalizeGuess(correctWord) + "::" + normalizeGuess(guessWord);
}

function emptyFeedback(): FeedbackRecord {
  return {
    accepted: 0,
    rejected: 0,
    updatedAt: Date.now(),
  };
}

function parseFeedback(value: unknown): FeedbackRecord {
  if (!value || typeof value !== "string") return emptyFeedback();

  try {
    const parsed = JSON.parse(value) as Partial<FeedbackRecord>;
    return {
      accepted: typeof parsed.accepted === "number" ? Math.max(0, Math.floor(parsed.accepted)) : 0,
      rejected: typeof parsed.rejected === "number" ? Math.max(0, Math.floor(parsed.rejected)) : 0,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return emptyFeedback();
  }
}

async function loadFeedback(correctWord: string, guessWord: string) {
  try {
    const raw = await redisCommand<string | null>(["GET", feedbackKey(correctWord, guessWord)]);
    return parseFeedback(raw);
  } catch (error) {
    if (error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED") {
      return emptyFeedback();
    }
    throw error;
  }
}

function makeJudgement(
  accepted: boolean,
  source: WordWolfGuessJudgementSource,
  reason: string,
  confidence: number,
  feedback: FeedbackRecord,
): WordWolfGuessJudgement {
  return {
    accepted,
    source,
    reason,
    confidence,
    feedbackAccepted: feedback.accepted,
    feedbackRejected: feedback.rejected,
  };
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length] ?? 0;
}

function fuzzyJudgement(guessWord: string, correctWord: string, feedback: FeedbackRecord) {
  const guess = normalizeGuess(guessWord);
  const correct = normalizeGuess(correctWord);
  if (!guess || !correct) {
    return makeJudgement(false, "fuzzy", "\u56de\u7b54\u307e\u305f\u306f\u6b63\u89e3\u304c\u7a7a\u3067\u3059\u3002", 0, feedback);
  }

  if (guess === correct) {
    return makeJudgement(true, "exact", "\u5b8c\u5168\u4e00\u81f4\u3057\u307e\u3057\u305f\u3002", 1, feedback);
  }

  const longerLength = Math.max(guess.length, correct.length);
  const distance = levenshteinDistance(guess, correct);
  const similarity = longerLength > 0 ? 1 - distance / longerLength : 0;
  const includes = guess.length >= 3 && correct.length >= 3 && (guess.includes(correct) || correct.includes(guess));

  if (similarity >= 0.86 || includes) {
    return makeJudgement(
      true,
      "fuzzy",
      "\u8868\u8a18\u3086\u308c\u3084\u7565\u79f0\u3068\u3057\u3066\u5b9f\u8cea\u4e00\u81f4\u3059\u308b\u53ef\u80fd\u6027\u304c\u9ad8\u3044\u3067\u3059\u3002",
      0.72,
      feedback,
    );
  }

  return makeJudgement(
    false,
    "fuzzy",
    "\u6b63\u89e3\u306b\u8fd1\u3044\u8868\u8a18\u3068\u306f\u5224\u5b9a\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002",
    Math.max(0.2, similarity),
    feedback,
  );
}

function isLlmEnabled() {
  return process.env.WORDWOLF_USE_LLM === "true" && Boolean(process.env.OPENAI_API_KEY);
}

function parseLlmJudgement(text: string, feedback: FeedbackRecord): WordWolfGuessJudgement | null {
  try {
    const parsed = JSON.parse(text) as Partial<WordWolfGuessJudgement>;
    if (typeof parsed.accepted !== "boolean") return null;

    return makeJudgement(
      parsed.accepted,
      "llm",
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : "LLM\u304c\u5b9f\u8cea\u4e00\u81f4\u3092\u5224\u5b9a\u3057\u307e\u3057\u305f\u3002",
      typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
      feedback,
    );
  } catch {
    return null;
  }
}

async function judgeWithLlm(guessWord: string, correctWord: string, feedback: FeedbackRecord) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 4500,
  });

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input:
      "You judge a Word Wolf reverse answer. Treat the guess as accepted only when it is essentially the same concept as the correct word. " +
      "Accept spelling variants, abbreviations, formal/common names, common English/Japanese translation differences, and very common aliases. " +
      "Reject merely related words, same-category but different items, broader/narrower concepts, rules, ingredients, places, people, or close-but-distinct games/sports. " +
      "Return JSON only: {\"accepted\":boolean,\"confidence\":0-1,\"reason\":\"short Japanese reason\"}\n" +
      "Correct word: " + correctWord + "\nGuess: " + guessWord,
  });

  return parseLlmJudgement(response.output_text, feedback);
}

export async function judgeWordWolfGuess(guessWord: string, correctWord: string): Promise<WordWolfGuessJudgement> {
  const feedback = await loadFeedback(correctWord, guessWord);

  if (feedback.accepted !== feedback.rejected) {
    return makeJudgement(
      feedback.accepted > feedback.rejected,
      "feedback",
      "\u904e\u53bb\u306e\u30d7\u30ec\u30a4\u30e4\u30fc\u30d5\u30a3\u30fc\u30c9\u30d0\u30c3\u30af\u3092\u512a\u5148\u3057\u307e\u3057\u305f\u3002",
      0.9,
      feedback,
    );
  }

  const simple = fuzzyJudgement(guessWord, correctWord, feedback);
  if (simple.source === "exact") return simple;

  if (isLlmEnabled()) {
    try {
      return (await judgeWithLlm(guessWord, correctWord, feedback)) ?? simple;
    } catch (error) {
      console.error("[wordwolf/guess] falling back to fuzzy judgement", error);
    }
  }

  return simple;
}

export async function recordWordWolfGuessFeedback(guessWord: string, correctWord: string, accepted: boolean) {
  const feedback = await loadFeedback(correctWord, guessWord);
  const nextFeedback = {
    ...feedback,
    accepted: feedback.accepted + (accepted ? 1 : 0),
    rejected: feedback.rejected + (accepted ? 0 : 1),
    updatedAt: Date.now(),
  };

  await redisCommand<"OK">(["SET", feedbackKey(correctWord, guessWord), JSON.stringify(nextFeedback)]);
  return nextFeedback;
}
