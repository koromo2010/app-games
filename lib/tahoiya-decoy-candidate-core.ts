import { createHash } from "node:crypto";
import type { TahoiyaRoom } from "./tahoiya-types.ts";

export const tahoiyaSoloActiveCandidateLimit = 9;
export const tahoiyaSoloDecoyCount = 3;

export const tahoiyaDecoyCandidateStatuses = [
  "unreviewed",
  "eligible",
  "excluded_same_as_answer",
  "review_uncertain",
  "archived_zero_votes",
  "archived_low_votes",
  "rejected_moderation",
] as const;

export type TahoiyaDecoyCandidateStatus = typeof tahoiyaDecoyCandidateStatuses[number];
export type TahoiyaDecoySourceKind = "multiplayer_round" | "legacy_replay" | "solo_choice";

export type TahoiyaDecoyCandidateEventInput = {
  candidateId: string;
  sourceEventId: string;
  sourceKind: TahoiyaDecoySourceKind;
  word: string;
  normalizedWord: string;
  reading: string | null;
  realDefinition: string;
  realDefinitionHash: string;
  definitionText: string;
  normalizedDefinition: string;
  definitionHash: string;
  votes: number;
  voterOpportunities: number;
  appearances: number;
  occurredAt: number;
};

type SalvageReplayDefinition = {
  id: string;
  text: string;
  authorId: string | null;
  isReal: boolean;
};

export type SalvageTahoiyaReplay = {
  id: string;
  finishedAt: number;
  word: string;
  reading: string | null;
  realDefinition: string;
  definitions: SalvageReplayDefinition[];
  votes: Record<string, string>;
};

function normalizedText(value: string, maximumLength: number) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, maximumLength);
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeTahoiyaDecoyWord(value: string) {
  return normalizedText(value, 120).toLocaleLowerCase("ja");
}

export function normalizeTahoiyaDecoyDefinition(value: string) {
  return normalizedText(value, 1_200);
}

function candidateIdentity(normalizedWord: string, normalizedDefinition: string) {
  const definitionHash = digest(normalizedDefinition);
  return {
    candidateId: `tahoiya_decoy_${digest(`${normalizedWord}\0${definitionHash}`).slice(0, 40)}`,
    definitionHash,
  };
}

function validVotes(votes: Record<string, string>, optionIds: Set<string>) {
  return Object.fromEntries(Object.entries(votes).filter(([, optionId]) => optionIds.has(optionId)));
}

function isReusableFakeDefinition(definition: SalvageReplayDefinition) {
  if (definition.isReal || !definition.authorId || definition.authorId.startsWith("dummy-")) return false;
  const text = normalizeTahoiyaDecoyDefinition(definition.text);
  return Boolean(text && text !== "特定の作業に使われる古い道具の一種。");
}

function candidateEvent(input: {
  eventNamespace: string;
  sourceKind: TahoiyaDecoySourceKind;
  occurredAt: number;
  word: string;
  reading?: string | null;
  realDefinition: string;
  definition: SalvageReplayDefinition;
  votes: Record<string, string>;
  optionIds: Set<string>;
}): TahoiyaDecoyCandidateEventInput | null {
  if (!isReusableFakeDefinition(input.definition)) return null;
  const word = normalizedText(input.word, 120);
  const normalizedWord = normalizeTahoiyaDecoyWord(word);
  const realDefinition = normalizedText(input.realDefinition, 1_200);
  const definitionText = normalizedText(input.definition.text, 1_200);
  const normalizedDefinition = normalizeTahoiyaDecoyDefinition(definitionText);
  if (!word || !normalizedWord || !realDefinition || !normalizedDefinition) return null;

  const acceptedVotes = validVotes(input.votes, input.optionIds);
  const votes = Object.values(acceptedVotes).filter((optionId) => optionId === input.definition.id).length;
  const voterOpportunities = Object.keys(acceptedVotes).filter((voterId) => voterId !== input.definition.authorId).length;
  const identity = candidateIdentity(normalizedWord, normalizedDefinition);
  return {
    ...identity,
    sourceEventId: `tahoiya_decoy_event_${digest(`${input.eventNamespace}\0${input.definition.id}`).slice(0, 40)}`,
    sourceKind: input.sourceKind,
    word,
    normalizedWord,
    reading: normalizedText(input.reading ?? "", 160) || null,
    realDefinition,
    realDefinitionHash: digest(realDefinition),
    definitionText,
    normalizedDefinition,
    votes,
    voterOpportunities,
    appearances: 1,
    occurredAt: input.occurredAt,
  };
}

export function parseTahoiyaReplayForSalvage(raw: unknown): SalvageTahoiyaReplay | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      parsed.schemaVersion !== 1
      || parsed.gameType !== "tahoiya"
      || typeof parsed.id !== "string"
      || typeof parsed.finishedAt !== "number"
      || typeof parsed.word !== "string"
      || typeof parsed.realDefinition !== "string"
      || !Array.isArray(parsed.definitions)
      || !parsed.votes
      || typeof parsed.votes !== "object"
    ) return null;
    const definitions = parsed.definitions.flatMap((value): SalvageReplayDefinition[] => {
      if (!value || typeof value !== "object") return [];
      const definition = value as Record<string, unknown>;
      if (typeof definition.id !== "string" || typeof definition.text !== "string") return [];
      return [{
        id: definition.id,
        text: definition.text,
        authorId: typeof definition.authorId === "string" ? definition.authorId : null,
        isReal: definition.isReal === true,
      }];
    });
    const votes = Object.fromEntries(Object.entries(parsed.votes as Record<string, unknown>)
      .filter((entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === "string"));
    return {
      id: parsed.id,
      finishedAt: parsed.finishedAt,
      word: parsed.word,
      reading: typeof parsed.reading === "string" ? parsed.reading : null,
      realDefinition: parsed.realDefinition,
      definitions,
      votes,
    };
  } catch {
    return null;
  }
}

export function tahoiyaDecoyEventsFromReplay(replay: SalvageTahoiyaReplay) {
  if (replay.definitions.some((definition) => definition.authorId?.startsWith("dummy-"))) return [];
  const optionIds = new Set(replay.definitions.map((definition) => definition.id));
  return replay.definitions.flatMap((definition) => {
    const event = candidateEvent({
      eventNamespace: `legacy_replay\0${replay.id}`,
      sourceKind: "legacy_replay",
      occurredAt: replay.finishedAt,
      word: replay.word,
      reading: replay.reading,
      realDefinition: replay.realDefinition,
      definition,
      votes: replay.votes,
      optionIds,
    });
    return event ? [event] : [];
  });
}

export function tahoiyaDecoyEventsFromRoom(room: TahoiyaRoom) {
  if (room.debugMode || room.phase !== "result" || !room.word || !room.realDefinition || room.options.length === 0) return [];
  const definitions = room.options.map((option): SalvageReplayDefinition => ({
    id: option.id,
    text: option.text,
    authorId: option.authorId,
    isReal: option.isReal,
  }));
  const optionIds = new Set(definitions.map((definition) => definition.id));
  return definitions.flatMap((definition) => {
    const event = candidateEvent({
      eventNamespace: `multiplayer_round\0${room.code}\0${room.createdAt}\0${room.round}`,
      sourceKind: "multiplayer_round",
      occurredAt: room.updatedAt || Date.now(),
      word: room.word,
      reading: room.reading,
      realDefinition: room.realDefinition,
      definition,
      votes: room.votes,
      optionIds,
    });
    return event ? [event] : [];
  });
}

export function tahoiyaDecoyTotalVotes(candidate: { multiplayerVotes: number; soloVotes: number }) {
  return Math.max(0, candidate.multiplayerVotes) + Math.max(0, candidate.soloVotes);
}

export function isTahoiyaDecoyPureZero(candidate: {
  multiplayerVotes: number;
  soloVotes: number;
  multiplayerVoteOpportunities: number;
  soloAppearances: number;
}) {
  return tahoiyaDecoyTotalVotes(candidate) === 0
    && candidate.multiplayerVoteOpportunities + candidate.soloAppearances > 0;
}
