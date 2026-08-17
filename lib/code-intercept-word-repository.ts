import { drawGameContentWords } from "./game-content-source.ts";
import { generalGameWordPoolSource } from "./general-game-word-pool.ts";
import type { GeneralGameWordDifficulty } from "./general-game-word-classification.ts";

export const codeInterceptDebugWordSampleSize = 10;
export const codeInterceptWordPoolSource = generalGameWordPoolSource;

export async function loadCodeInterceptWordPool(
  requestedLimit: number,
  difficulty: GeneralGameWordDifficulty = "normal",
) {
  const limit = Math.max(1, Math.min(100, Math.floor(requestedLimit)));
  const words = await drawGameContentWords({
    pool: "general",
    difficulty,
    count: limit,
  });
  return words.map((word) => word.surface);
}
