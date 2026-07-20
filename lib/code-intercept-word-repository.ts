import { generalGameWordPoolFlag, loadGeneralGameWords, type GeneralGameWordDifficulty } from "./general-game-word-pool.ts";

export const codeInterceptDebugWordSampleSize = 10;
export const codeInterceptWordPoolSource = generalGameWordPoolFlag;

export async function loadCodeInterceptWordPool(
  requestedLimit: number,
  difficulty: GeneralGameWordDifficulty = "normal",
) {
  const limit = Math.max(1, Math.min(100, Math.floor(requestedLimit)));
  return loadGeneralGameWords({ difficulty, count: limit });
}
