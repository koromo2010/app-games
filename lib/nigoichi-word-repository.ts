import type { NigoichiWordDifficulty } from "./nigoichi.ts";
import { loadGeneralGameWords } from "./general-game-word-pool.ts";

export async function loadNigoichiWordPool(
  difficulty: NigoichiWordDifficulty,
  requestedLimit: number,
) {
  const limit = Math.max(1, Math.min(100, Math.floor(requestedLimit)));
  return loadGeneralGameWords({ difficulty, count: limit });
}
