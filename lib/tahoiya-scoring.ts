import type { TahoiyaDefinitionOption, TahoiyaPlayer } from "./tahoiya-types.ts";

export const TAHOIYA_CORRECT_VOTE_POINTS = 1;
export const TAHOIYA_FOOLED_VOTE_POINTS = 1;

export function calculateTahoiyaRoundScores(input: {
  options: TahoiyaDefinitionOption[];
  players: TahoiyaPlayer[];
  votes: Record<string, string>;
}) {
  const scores = Object.fromEntries(input.players.map((player) => [player.id, 0]));
  for (const [voterId, optionId] of Object.entries(input.votes)) {
    const option = input.options.find((item) => item.id === optionId);
    if (option?.isReal) {
      scores[voterId] = (scores[voterId] ?? 0) + TAHOIYA_CORRECT_VOTE_POINTS;
    } else if (option?.authorId) {
      scores[option.authorId] = (scores[option.authorId] ?? 0) + TAHOIYA_FOOLED_VOTE_POINTS;
    }
  }
  return scores;
}
