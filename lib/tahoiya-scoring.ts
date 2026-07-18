import type { TahoiyaDefinitionOption, TahoiyaPlayer } from "./tahoiya-types.ts";
import { runtimeHyperparameterNumber } from "./runtime-hyperparameters-core.ts";

export const TAHOIYA_CORRECT_VOTE_POINTS = 1;
export const TAHOIYA_FOOLED_VOTE_POINTS = 1;

export function tahoiyaRuntimeScoring() {
  return {
    correctVotePoints: runtimeHyperparameterNumber("tahoiya-correct-points", TAHOIYA_CORRECT_VOTE_POINTS),
    fooledVotePoints: runtimeHyperparameterNumber("tahoiya-fooled-points", TAHOIYA_FOOLED_VOTE_POINTS),
  };
}

export function tahoiyaValidVotes(input: {
  options: TahoiyaDefinitionOption[];
  players: TahoiyaPlayer[];
  votes: Record<string, string>;
}) {
  const playerIds = new Set(input.players.map((player) => player.id));
  const options = new Map(input.options.map((option) => [option.id, option]));
  return Object.fromEntries(Object.entries(input.votes).filter(([voterId, optionId]) => {
    const option = options.get(optionId);
    return playerIds.has(voterId) && Boolean(option) && option?.authorId !== voterId;
  }));
}

export function calculateTahoiyaRoundScores(input: {
  options: TahoiyaDefinitionOption[];
  players: TahoiyaPlayer[];
  votes: Record<string, string>;
  correctVotePoints?: number;
  fooledVotePoints?: number;
}) {
  const correctVotePoints = input.correctVotePoints ?? TAHOIYA_CORRECT_VOTE_POINTS;
  const fooledVotePoints = input.fooledVotePoints ?? TAHOIYA_FOOLED_VOTE_POINTS;
  const scores = Object.fromEntries(input.players.map((player) => [player.id, 0]));
  for (const [voterId, optionId] of Object.entries(tahoiyaValidVotes(input))) {
    const option = input.options.find((item) => item.id === optionId);
    if (option?.isReal) {
      scores[voterId] = (scores[voterId] ?? 0) + correctVotePoints;
    } else if (option?.authorId) {
      scores[option.authorId] = (scores[option.authorId] ?? 0) + fooledVotePoints;
    }
  }
  return scores;
}
