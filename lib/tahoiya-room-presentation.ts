import type { TahoiyaRoom, TahoiyaRoomChoice } from "./tahoiya-types.ts";
import { tahoiyaTimeoutSubmission } from "./tahoiya-room-domain.ts";

export function sanitizeTahoiyaRoom(room: TahoiyaRoom, playerId: string): TahoiyaRoom {
  const revealAll = room.phase === "result" || (room.debugMode === true && room.hostId === playerId);
  const hideTopicFromAnswerer = !revealAll
    && room.phase === "writing"
    && room.playMode === "single-answerer"
    && room.answererId === playerId;
  const canSeeRealDefinition = revealAll || (
    room.phase === "writing" && room.playMode === "single-answerer" && room.showRealDefinitionToWriters && room.answererId !== playerId
  );
  const submittedMarker = "__submitted__";
  const submittedDefinitions = Object.entries(room.fakeDefinitions)
    .map(([authorId, definitions]) => [authorId, definitions.map((text) => text === tahoiyaTimeoutSubmission ? "" : text)] as const)
    .filter(([, definitions]) => definitions.some(Boolean));
  const submittedVotes = Object.entries(room.votes)
    .filter(([, optionId]) => optionId !== tahoiyaTimeoutSubmission);
  return {
    ...room,
    passphrase: room.passphrase ? "••••••••" : "",
    word: hideTopicFromAnswerer ? "" : room.word,
    reading: hideTopicFromAnswerer ? undefined : room.reading,
    realDefinition: canSeeRealDefinition ? room.realDefinition : "",
    topicNote: canSeeRealDefinition ? room.topicNote : "",
    topicSourceDetail: canSeeRealDefinition ? room.topicSourceDetail : "",
    fakeDefinitions: revealAll
      ? Object.fromEntries(submittedDefinitions)
      : Object.fromEntries(submittedDefinitions.map(([authorId, definitions]) => [
        authorId,
        authorId === playerId ? definitions : definitions.map((text) => text ? submittedMarker : ""),
      ])),
    options: revealAll ? room.options : room.options.map((option) => ({ ...option, authorId: option.authorId === playerId ? playerId : null, isReal: false })),
    votes: revealAll
      ? Object.fromEntries(submittedVotes)
      : Object.fromEntries(submittedVotes.map(([voterId, optionId]) => [voterId, voterId === playerId ? optionId : submittedMarker])),
  };
}

export function tahoiyaRoomChoice(room: TahoiyaRoom): TahoiyaRoomChoice {
  return { code: room.code, hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown", playerCount: room.players.length, phase: room.phase, hasPassphrase: Boolean(room.passphrase), updatedAt: room.updatedAt };
}
