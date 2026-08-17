import type { NigoichiWordDifficulty } from "./nigoichi.ts";
import { drawGameContentWords } from "./game-content-source.ts";

export async function loadNigoichiWordPool(
  difficulty: NigoichiWordDifficulty,
  requestedLimit: number,
) {
  const limit = Math.max(1, Math.min(100, Math.floor(requestedLimit)));
  const words = await drawGameContentWords({
    pool: "general",
    difficulty,
    count: limit,
  });
  return words.map((word) => word.surface);
}
