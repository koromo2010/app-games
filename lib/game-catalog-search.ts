export type SearchableGameCatalogEntry = {
  id: string;
  title: string;
  englishTitle?: string;
  href?: string;
  tags: readonly string[];
  summary: string;
};

export function normalizeGameSearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

function compactSearchText(value: string) {
  return normalizeGameSearchText(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left) return [...right].length;
  if (!right) return [...left].length;
  const leftCharacters = [...left];
  const rightCharacters = [...right];
  const matrix = Array.from({ length: leftCharacters.length + 1 }, () => Array(rightCharacters.length + 1).fill(0));
  for (let leftIndex = 0; leftIndex <= leftCharacters.length; leftIndex += 1) matrix[leftIndex][0] = leftIndex;
  for (let rightIndex = 0; rightIndex <= rightCharacters.length; rightIndex += 1) matrix[0][rightIndex] = rightIndex;
  for (let leftIndex = 1; leftIndex <= leftCharacters.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= rightCharacters.length; rightIndex += 1) {
      const substitutionCost = leftCharacters[leftIndex - 1] === rightCharacters[rightIndex - 1] ? 0 : 1;
      matrix[leftIndex][rightIndex] = Math.min(
        matrix[leftIndex - 1][rightIndex] + 1,
        matrix[leftIndex][rightIndex - 1] + 1,
        matrix[leftIndex - 1][rightIndex - 1] + substitutionCost,
      );
      if (leftIndex > 1 && rightIndex > 1
        && leftCharacters[leftIndex - 1] === rightCharacters[rightIndex - 2]
        && leftCharacters[leftIndex - 2] === rightCharacters[rightIndex - 1]) {
        matrix[leftIndex][rightIndex] = Math.min(matrix[leftIndex][rightIndex], matrix[leftIndex - 2][rightIndex - 2] + 1);
      }
    }
  }
  return matrix[leftCharacters.length][rightCharacters.length];
}

function fuzzySimilarity(query: string, candidate: string) {
  const queryCharacters = [...query];
  const candidateCharacters = [...candidate];
  if (candidateCharacters.length <= queryCharacters.length + 2) {
    return 1 - editDistance(query, candidate) / Math.max(queryCharacters.length, candidateCharacters.length, 1);
  }
  let best = 0;
  for (const length of [queryCharacters.length - 1, queryCharacters.length, queryCharacters.length + 1]) {
    if (length <= 0) continue;
    for (let index = 0; index <= candidateCharacters.length - length; index += 1) {
      const window = candidateCharacters.slice(index, index + length).join("");
      best = Math.max(best, 1 - editDistance(query, window) / Math.max(queryCharacters.length, length));
    }
  }
  return best;
}

function strongFieldMatches(query: string, field: string) {
  const candidate = compactSearchText(field);
  if (!candidate) return false;
  if (candidate.includes(query)) return true;
  if ([...query].length <= 2) return false;
  const threshold = [...query].length <= 3 ? 2 / 3 : [...query].length === 4 ? 0.75 : 0.7;
  return fuzzySimilarity(query, candidate) >= threshold;
}

export function gameMatchesSearch(game: SearchableGameCatalogEntry, query: string) {
  const tokens = normalizeGameSearchText(query)
    .split(/[^\p{L}\p{N}]+/u)
    .map(compactSearchText)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const strongFields = [game.title, game.englishTitle ?? "", game.id, game.href ?? "", ...game.tags];
  const summary = compactSearchText(game.summary);
  return tokens.every((token) => summary.includes(token) || strongFields.some((field) => strongFieldMatches(token, field)));
}

export function filterGamesBySearch<Game extends SearchableGameCatalogEntry>(games: readonly Game[], query: string) {
  return games.filter((game) => gameMatchesSearch(game, query));
}
