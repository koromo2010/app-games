import type { TahoiyaRoom, TahoiyaRoomChoice } from "./tahoiya-types.ts";

export function sanitizeTahoiyaRoom(room: TahoiyaRoom, playerId: string): TahoiyaRoom {
  const revealAll = room.phase === "result" || (room.debugMode === true && room.hostId === playerId);
  const canSeeRealDefinition = revealAll || (
    room.phase === "writing" && room.playMode === "single-answerer" && room.showRealDefinitionToWriters && room.answererId !== playerId
  );
  const submittedMarker = "__submitted__";
  return {
    ...room,
    passphrase: room.passphrase ? "••••••••" : "",
    realDefinition: canSeeRealDefinition ? room.realDefinition : "",
    topicNote: canSeeRealDefinition ? room.topicNote : "",
    topicSourceDetail: canSeeRealDefinition ? room.topicSourceDetail : "",
    fakeDefinitions: revealAll ? room.fakeDefinitions : Object.fromEntries(Object.entries(room.fakeDefinitions).map(([authorId, text]) => [authorId, authorId === playerId ? text : submittedMarker])),
    options: revealAll ? room.options : room.options.map((option) => ({ ...option, authorId: option.authorId === playerId ? playerId : null, isReal: false })),
    votes: revealAll ? room.votes : Object.fromEntries(Object.entries(room.votes).map(([voterId, optionId]) => [voterId, voterId === playerId ? optionId : submittedMarker])),
  };
}

export function tahoiyaRoomChoice(room: TahoiyaRoom): TahoiyaRoomChoice {
  return { code: room.code, hostName: room.players.find((player) => player.id === room.hostId)?.name ?? "Unknown", playerCount: room.players.length, phase: room.phase, hasPassphrase: Boolean(room.passphrase), updatedAt: room.updatedAt };
}
