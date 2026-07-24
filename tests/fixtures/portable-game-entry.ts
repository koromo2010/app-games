import { installGameSdkPortableServer } from "@game-fields/game-sdk/portable-server";

const manifest = {
  sdkVersion: 1,
  id: "portable-fixture",
  title: { ja: "隔離実行fixture", en: "Portable fixture" },
  playMode: "online-room",
  minimumPlayers: 1,
  maximumPlayers: 4,
  supportsDebug: false,
  supportsSpectators: false,
  supportsReplay: false,
  supportsRating: false,
  usesLlm: false,
  settings: [],
} as const;

type PortableFixtureRoom = {
  code: string;
  revision: number;
  phase: string;
  hostPlayerId: string;
  word: string | null;
};

installGameSdkPortableServer({
  manifest,
  createRoom(_, context): PortableFixtureRoom {
    return {
      code: context.roomCode,
      revision: 1,
      phase: "lobby",
      hostPlayerId: context.actor.playerId,
      word: null,
    };
  },
  async applyCommand(room, command, context) {
    if (command.type !== "draw") throw new Error("INVALID_COMMAND");
    const words = await context.resources.contentSource?.drawWords({
      pool: "general-words",
      count: 1,
      difficulty: "normal",
    });
    const word = words?.[0];
    if (!word) throw new Error("EMPTY_WORD");
    return {
      ...room,
      revision: room.revision + 1,
      phase: "playing",
      word: word.surface,
    };
  },
  presentRoom(room) {
    return {
      phase: room.phase,
      hasWord: Boolean(room.word),
    };
  },
});
